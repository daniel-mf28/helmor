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
