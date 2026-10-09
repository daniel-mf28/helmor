//! Latest-wins coalescing of `StreamingPartial` frontend emits.
//!
//! # Why
//!
//! Every streaming token delta makes the pipeline rebuild the whole
//! trailing message and emit it as `AgentStreamEvent::StreamingPartial`.
//! On a long reply that is O(n²) bytes over IPC plus one `JSON.parse` per
//! delta on the JS main thread — even though the frontend only keeps the
//! *latest* partial per animation frame (`accumulator.pendingPartial` is a
//! single slot, overwritten on every `streamingPartial` and cleared on
//! every `update`).
//!
//! This coalescer sits on the emit path (`streaming::actions::apply_action`)
//! and rate-limits partials to at most one per [`PARTIAL_FLUSH_INTERVAL`].
//!
//! # Ordering contract (the whole point — read before changing)
//!
//! The emitted sequence is always a **subsequence** of the sequence the
//! loop would have emitted without coalescing. Only `StreamingPartial`
//! events are ever removed, and only when they are superseded before any
//! other event reaches the wire. Concretely:
//!
//! 1. **Partial → partial**: a newer partial replaces the pending one
//!    (latest wins). The older one is never sent.
//! 2. **Partial → `Update`**: the pending partial is DROPPED. `Update` is a
//!    full render that already contains the current trailing partial
//!    (`MessagePipeline::render_full` appends `build_partial`), and the
//!    frontend nulls `pendingPartial` on every `update` anyway — so the
//!    dropped partial could never be the last thing rendered.
//! 3. **Partial → anything else** (`Done`, `Aborted`, `Error`,
//!    `TaskStateUpdate`, `PermissionRequest`, `UserInputRequest`,
//!    `PlanCaptured`): the pending partial is FLUSHED first, then the
//!    event. This reproduces the uncoalesced order exactly (minus earlier,
//!    already-superseded partials). In practice `Done`/`Aborted` are always
//!    preceded by an `Update` (see `TurnSession::handle_end_or_aborted`), so
//!    by then nothing is pending; `Error` has no preceding `Update`, so the
//!    last partial is flushed ahead of it, exactly like before.
//! 4. A partial is never emitted *after* a later non-partial event: the
//!    pending slot is always resolved (flushed or dropped) before any
//!    non-partial event is returned from [`PartialCoalescer::route`].
//!
//! # Latency
//!
//! - Leading edge: if no partial was sent within the last interval, a new
//!   partial goes out immediately. Slow streams therefore see zero added
//!   latency; only bursts are thinned.
//! - Bursts: a partial arriving after the interval elapsed is sent
//!   immediately (replacing whatever was pending), so a continuous burst
//!   that never lets the receive loop time out still produces one frame
//!   per interval — no starvation.
//! - Trailing edge: when a burst stops, the event loop wakes at
//!   [`PartialCoalescer::deadline`] and calls [`PartialCoalescer::flush_due`]
//!   so the final partial lands at most one interval late.
//!
//! # Testability
//!
//! The coalescer is pure: it never reads the clock. Every method takes
//! `now: Instant`, so tests drive it with a synthetic clock
//! (`tests/stream_partial_coalescing.rs`).

use std::time::{Duration, Instant};

use super::AgentStreamEvent;

/// Minimum spacing between two `StreamingPartial` emits. ~40 fps: below a
/// 60 Hz frame budget there's no visible difference for streaming text,
/// while bursty token streams collapse to a bounded IPC rate.
pub const PARTIAL_FLUSH_INTERVAL: Duration = Duration::from_millis(24);

/// See the module docs for the ordering contract.
#[derive(Debug)]
pub struct PartialCoalescer {
    interval: Duration,
    /// Latest not-yet-sent partial. Invariant: only ever holds
    /// `AgentStreamEvent::StreamingPartial`.
    pending: Option<AgentStreamEvent>,
    /// When the last partial actually went out. `None` until the first.
    last_partial_sent: Option<Instant>,
}

impl PartialCoalescer {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            pending: None,
            last_partial_sent: None,
        }
    }

    /// Route one outgoing event. Returns the events to send *now*, in
    /// order (0, 1 or 2 events). Callers must send them in the returned
    /// order and must route every frontend emit of the turn through here.
    pub fn route(&mut self, event: AgentStreamEvent, now: Instant) -> Vec<AgentStreamEvent> {
        match event {
            AgentStreamEvent::StreamingPartial { .. } => {
                if self.is_due(now) {
                    // Leading edge / burst cadence: send the newest one now.
                    // Anything pending is older and superseded by `event`.
                    self.pending = None;
                    self.last_partial_sent = Some(now);
                    vec![event]
                } else {
                    // Latest wins: overwrite (drop) any older pending partial.
                    self.pending = Some(event);
                    Vec::new()
                }
            }
            AgentStreamEvent::Update { .. } => {
                // Full snapshot supersedes the pending partial (rule 2).
                self.pending = None;
                vec![event]
            }
            other => {
                // Everything else: flush the pending partial first (rule 3).
                let mut out = Vec::with_capacity(2);
                if let Some(partial) = self.take_pending(now) {
                    out.push(partial);
                }
                out.push(other);
                out
            }
        }
    }

    /// Timer tick: returns the pending partial if its flush time has come.
    pub fn flush_due(&mut self, now: Instant) -> Option<AgentStreamEvent> {
        if self.pending.is_some() && self.is_due(now) {
            self.take_pending(now)
        } else {
            None
        }
    }

    /// When the event loop must wake up to flush the pending partial.
    /// `None` when nothing is pending (no timer needed).
    pub fn deadline(&self) -> Option<Instant> {
        self.pending.as_ref()?;
        // A partial is only parked when `is_due` was false, which requires
        // `last_partial_sent` to be set — so this is `Some` whenever
        // something is pending.
        self.last_partial_sent.map(|last| last + self.interval)
    }

    pub fn has_pending(&self) -> bool {
        self.pending.is_some()
    }

    /// Drop the parked partial without sending it. Returns whether one was
    /// parked. Only for stream teardown, after which nothing may be sent.
    pub fn discard_pending(&mut self) -> bool {
        self.pending.take().is_some()
    }

    fn is_due(&self, now: Instant) -> bool {
        match self.last_partial_sent {
            Some(last) => now.saturating_duration_since(last) >= self.interval,
            None => true,
        }
    }

    fn take_pending(&mut self, now: Instant) -> Option<AgentStreamEvent> {
        let partial = self.pending.take()?;
        self.last_partial_sent = Some(now);
        Some(partial)
    }
}

impl Default for PartialCoalescer {
    fn default() -> Self {
        Self::new(PARTIAL_FLUSH_INTERVAL)
    }
}

#[cfg(test)]
mod ordering_property_tests {
    //! Randomized check of the ordering contract in the module docs.
    //!
    //! Thousands of seeded sequences mixing partials, full `Update`s and
    //! other events (`PlanCaptured`, `Error`) are routed through the
    //! coalescer with random inter-arrival gaps, servicing the
    //! trailing-edge timer exactly like the event loop does. Every run must
    //! satisfy:
    //!
    //! 1. The wire is a subsequence of the input (no reordering, nothing
    //!    invented).
    //! 2. Every non-partial event reaches the wire.
    //! 3. A partial is only dropped when a newer partial or an `Update`
    //!    supersedes it before any other event.
    //! 4. The newest partial preceding a non-`Update` event (with no
    //!    `Update` in between) reaches the wire before that event.
    //! 5. A trailing partial (nothing after it) is eventually flushed.
    //! 6. Partials sent on the leading edge / timer are spaced at least one
    //!    interval apart (only rule-3 flushes may come early).
    use super::*;
    use crate::pipeline::types::{MessageRole, ThreadMessageLike};

    const INTERVAL: Duration = Duration::from_millis(24);

    #[derive(Clone, Copy, PartialEq, Debug)]
    enum Kind {
        Partial,
        Update,
        Other,
    }

    fn msg(tag: usize) -> ThreadMessageLike {
        ThreadMessageLike {
            role: MessageRole::Assistant,
            id: Some(tag.to_string()),
            created_at: None,
            content: Vec::new(),
            status: None,
            streaming: Some(true),
        }
    }

    fn make(kind: Kind, tag: usize) -> AgentStreamEvent {
        match kind {
            Kind::Partial => AgentStreamEvent::StreamingPartial { message: msg(tag) },
            Kind::Update => AgentStreamEvent::Update {
                messages: vec![msg(tag)],
            },
            Kind::Other => AgentStreamEvent::Error {
                message: tag.to_string(),
                persisted: false,
                internal: false,
            },
        }
    }

    fn tag_of(event: &AgentStreamEvent) -> usize {
        let raw = match event {
            AgentStreamEvent::StreamingPartial { message } => message.id.clone(),
            AgentStreamEvent::Update { messages } => messages[0].id.clone(),
            AgentStreamEvent::Error { message, .. } => Some(message.clone()),
            other => panic!("unexpected event {other:?}"),
        };
        raw.unwrap().parse().unwrap()
    }

    /// Tiny deterministic LCG — no extra dev-dependency needed.
    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self, bound: u64) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (self.0 >> 33) % bound
        }
    }

    /// `(tag, sent_at, via_flush_ahead_of_other)` for every wire event.
    type Wire = Vec<(usize, Instant, bool)>;

    fn run(seed: u64, len: usize) -> (Vec<Kind>, Wire) {
        let mut rng = Lcg(seed);
        let start = Instant::now();
        let mut now = start;
        let mut c = PartialCoalescer::new(INTERVAL);
        let mut kinds = Vec::with_capacity(len);
        let mut wire: Wire = Vec::new();

        // Advance the clock, firing the trailing-edge timer like the loop.
        let advance =
            |c: &mut PartialCoalescer, now: &mut Instant, to: Instant, wire: &mut Wire| {
                while let Some(deadline) = c.deadline() {
                    if deadline > to {
                        break;
                    }
                    *now = (*now).max(deadline);
                    if let Some(ev) = c.flush_due(*now) {
                        wire.push((tag_of(&ev), *now, false));
                    }
                }
                *now = to;
            };

        for tag in 0..len {
            // Mostly partials (token stream), some updates, rare others.
            let kind = match rng.next(10) {
                0..=6 => Kind::Partial,
                7 | 8 => Kind::Update,
                _ => Kind::Other,
            };
            kinds.push(kind);
            // Gaps cluster below the interval (bursts) with occasional pauses.
            let gap = match rng.next(4) {
                0 => rng.next(80),
                _ => rng.next(12),
            };
            let to = now + Duration::from_millis(gap);
            advance(&mut c, &mut now, to, &mut wire);
            let out = c.route(make(kind, tag), now);
            let n = out.len();
            for (i, ev) in out.into_iter().enumerate() {
                // A partial returned ahead of another event is a rule-3 flush.
                let flushed_ahead = n == 2 && i == 0;
                wire.push((tag_of(&ev), now, flushed_ahead));
            }
        }
        // Let any trailing partial flush.
        let to = now + INTERVAL * 4;
        advance(&mut c, &mut now, to, &mut wire);
        assert!(!c.has_pending(), "seed {seed}: partial left parked");
        (kinds, wire)
    }

    fn check(seed: u64, kinds: &[Kind], wire: &Wire) {
        let tags: Vec<usize> = wire.iter().map(|w| w.0).collect();
        // 1. Strictly increasing tags == subsequence of input, no dupes.
        assert!(
            tags.windows(2).all(|w| w[0] < w[1]),
            "seed {seed}: reordered or duplicated wire {tags:?}"
        );
        let sent: std::collections::HashSet<usize> = tags.iter().copied().collect();
        for (i, kind) in kinds.iter().enumerate() {
            match kind {
                // 2. Non-partials always go out.
                Kind::Update | Kind::Other => {
                    assert!(sent.contains(&i), "seed {seed}: lost {kind:?} #{i}")
                }
                Kind::Partial if !sent.contains(&i) => {
                    // 3. Dropped ⇒ superseded by a later partial/Update
                    //    before any Other.
                    let superseded = kinds[i + 1..]
                        .iter()
                        .take_while(|k| **k != Kind::Other)
                        .any(|k| matches!(k, Kind::Partial | Kind::Update));
                    assert!(
                        superseded,
                        "seed {seed}: partial #{i} dropped without supersession"
                    );
                }
                Kind::Partial => {}
            }
        }
        // 4. Newest partial before each Other (no Update between) is sent,
        //    and earlier on the wire than the Other.
        for (i, kind) in kinds.iter().enumerate() {
            if *kind != Kind::Other {
                continue;
            }
            let prev = kinds[..i]
                .iter()
                .rposition(|k| matches!(k, Kind::Partial | Kind::Update | Kind::Other));
            if let Some(p) = prev {
                if kinds[p] == Kind::Partial {
                    let pos_p = tags.iter().position(|t| *t == p);
                    let pos_o = tags.iter().position(|t| *t == i);
                    assert!(
                        matches!((pos_p, pos_o), (Some(a), Some(b)) if a < b),
                        "seed {seed}: partial #{p} not flushed ahead of other #{i}"
                    );
                }
            }
        }
        // 5. Trailing partial is delivered.
        if kinds.last() == Some(&Kind::Partial) {
            assert!(
                sent.contains(&(kinds.len() - 1)),
                "seed {seed}: trailing partial lost"
            );
        }
        // 6. Rate limit: leading-edge / timer partials are >= INTERVAL apart.
        let mut last_any: Option<Instant> = None;
        for w in wire.iter().filter(|(t, _, _)| kinds[*t] == Kind::Partial) {
            if !w.2 {
                if let Some(prev) = last_any {
                    assert!(
                        w.1.duration_since(prev) >= INTERVAL,
                        "seed {seed}: partials sent closer than the interval"
                    );
                }
            }
            last_any = Some(w.1);
        }
    }

    #[test]
    fn random_sequences_preserve_ordering_contract() {
        for seed in 0..5_000u64 {
            let len = 1 + (seed as usize % 60);
            let (kinds, wire) = run(seed, len);
            check(seed, &kinds, &wire);
        }
    }

    #[test]
    fn partial_is_never_sent_after_a_later_event() {
        // Directed: park a partial, then each non-partial kind in turn.
        for other in [Kind::Update, Kind::Other] {
            let t0 = Instant::now();
            let mut c = PartialCoalescer::new(INTERVAL);
            assert_eq!(c.route(make(Kind::Partial, 0), t0).len(), 1);
            assert!(c.route(make(Kind::Partial, 1), t0).is_empty());
            let out: Vec<usize> = c.route(make(other, 2), t0).iter().map(tag_of).collect();
            match other {
                Kind::Update => assert_eq!(out, [2]),
                _ => assert_eq!(out, [1, 2]),
            }
            // Nothing may surface afterwards, however long we wait.
            assert!(c.flush_due(t0 + INTERVAL * 10).is_none());
            assert!(c.deadline().is_none());
        }
    }
}
