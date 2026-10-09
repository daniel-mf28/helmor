//! Ordering + shape tests for `agents::partial_coalescer`.
//!
//! Real Claude stream events are pushed through `MessagePipeline` and the
//! resulting emits (`Partial` → `StreamingPartial`, `Full` → `Update`,
//! plus hand-built terminal events) are routed through a
//! `PartialCoalescer` driven by a synthetic clock. Each snapshot records
//! exactly what would hit the wire, in order, with the synthetic emit
//! time — so any reordering, a partial leaking after a terminal event, or
//! a lost final partial shows up as a snapshot diff.
//!
//! ```sh
//! INSTA_UPDATE=always cargo test --test stream_partial_coalescing
//! ```

use std::time::{Duration, Instant};

use helmor_lib::agents::partial_coalescer::PartialCoalescer;
use helmor_lib::agents::AgentStreamEvent;
use helmor_lib::pipeline::types::{ExtendedMessagePart, MessagePart, ThreadMessageLike};
use helmor_lib::pipeline::{MessagePipeline, PipelineEmit};
use insta::assert_yaml_snapshot;
use serde::Serialize;
use serde_json::{json, Value};

const INTERVAL: Duration = Duration::from_millis(24);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/// Snapshot-friendly view of one event that went out on the wire.
#[derive(Debug, Serialize)]
struct WireEvent {
    /// Synthetic ms since harness start at which it was sent.
    t_ms: u64,
    kind: &'static str,
    /// `StreamingPartial`: the partial's text. `Update`: one entry per
    /// message (`role: text`).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    body: Vec<String>,
}

fn message_text(msg: &ThreadMessageLike) -> String {
    msg.content
        .iter()
        .filter_map(|part| match part {
            ExtendedMessagePart::Basic(MessagePart::Text { text, .. }) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn describe(event: &AgentStreamEvent, t_ms: u64) -> WireEvent {
    let (kind, body) = match event {
        AgentStreamEvent::StreamingPartial { message } => {
            ("streamingPartial", vec![message_text(message)])
        }
        AgentStreamEvent::Update { messages } => (
            "update",
            messages
                .iter()
                .map(|m| format!("{:?}: {}", m.role, message_text(m)).to_lowercase())
                .collect(),
        ),
        AgentStreamEvent::Done { .. } => ("done", vec![]),
        AgentStreamEvent::Error { message, .. } => ("error", vec![message.clone()]),
        other => panic!("unexpected event in harness: {other:?}"),
    };
    WireEvent { t_ms, kind, body }
}

/// Drives pipeline + coalescer + synthetic clock, recording the wire.
struct Harness {
    pipeline: MessagePipeline,
    coalescer: PartialCoalescer,
    start: Instant,
    now: Instant,
    wire: Vec<WireEvent>,
}

impl Harness {
    fn new() -> Self {
        let start = Instant::now();
        Self {
            pipeline: MessagePipeline::new("claude", "opus", "ctx-1", "session-1"),
            coalescer: PartialCoalescer::new(INTERVAL),
            start,
            now: start,
            wire: Vec::new(),
        }
    }

    /// Advance the synthetic clock, servicing the trailing-edge timer the
    /// way the event loop does (wake at `deadline()`, call `flush_due`).
    fn advance(&mut self, ms: u64) {
        let target = self.now + Duration::from_millis(ms);
        while let Some(deadline) = self.coalescer.deadline() {
            if deadline > target {
                break;
            }
            self.now = self.now.max(deadline);
            if let Some(event) = self.coalescer.flush_due(self.now) {
                self.send(event);
            }
        }
        self.now = target;
    }

    fn route(&mut self, event: AgentStreamEvent) {
        for out in self.coalescer.route(event, self.now) {
            self.send(out);
        }
    }

    fn send(&mut self, event: AgentStreamEvent) {
        let t_ms = self.now.duration_since(self.start).as_millis() as u64;
        self.wire.push(describe(&event, t_ms));
    }

    /// Push one sidecar event through the real pipeline and route its emit.
    fn push(&mut self, raw: Value) {
        let line = raw.to_string();
        match self.pipeline.push_event(&raw, &line) {
            PipelineEmit::Full(messages) => self.route(AgentStreamEvent::Update { messages }),
            PipelineEmit::Partial(message) => {
                self.route(AgentStreamEvent::StreamingPartial { message })
            }
            PipelineEmit::None => {}
        }
    }

    fn done(&mut self) {
        self.route(AgentStreamEvent::Done {
            provider: "claude".into(),
            model_id: "opus".into(),
            resolved_model: "opus".into(),
            session_id: None,
            working_directory: "/tmp".into(),
            persisted: true,
        });
    }

    fn error(&mut self, message: &str) {
        self.route(AgentStreamEvent::Error {
            message: message.into(),
            persisted: true,
            internal: false,
        });
    }
}

fn text_block_start() -> Value {
    json!({
        "type": "stream_event",
        "event": {
            "type": "content_block_start",
            "index": 0,
            "content_block": {"type": "text", "text": ""},
        },
        "session_id": "session-1",
    })
}

fn text_delta(text: &str) -> Value {
    json!({
        "type": "stream_event",
        "event": {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "text_delta", "text": text},
        },
        "session_id": "session-1",
    })
}

fn assistant_final(text: &str) -> Value {
    json!({
        "type": "assistant",
        "message": {
            "id": "msg_1",
            "role": "assistant",
            "content": [{"type": "text", "text": text}],
        },
        "session_id": "session-1",
    })
}

/// Start a text block and stream `a`, `b`, `c` 5ms apart (all inside one
/// interval): `a` goes out on the leading edge, `b`/`c` are parked.
fn stream_burst(h: &mut Harness) {
    h.push(text_block_start());
    h.push(text_delta("a"));
    h.advance(5);
    h.push(text_delta("b"));
    h.advance(5);
    h.push(text_delta("c"));
    assert!(
        h.coalescer.has_pending(),
        "burst should leave a parked partial"
    );
}

/// Ordering invariant: nothing may follow the terminal event as a partial.
fn assert_no_partial_after_terminal(wire: &[WireEvent]) {
    if let Some(pos) = wire
        .iter()
        .position(|e| e.kind == "done" || e.kind == "error")
    {
        assert!(
            wire[pos..].iter().all(|e| e.kind != "streamingPartial"),
            "partial leaked after terminal event: {wire:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

#[test]
fn coalesce_partial_superseded_by_partial() {
    // a → sent immediately; b, c parked (latest wins: only "abc" survives);
    // the trailing-edge tick at t=24 flushes "abc". "ab" never hits the wire.
    let mut h = Harness::new();
    stream_burst(&mut h);
    h.advance(100);
    assert!(!h.coalescer.has_pending());
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_partial_then_full_drops_superseded_partial() {
    // The parked "abc" partial is dropped: the Update carries the
    // finalized text and the frontend clears pendingPartial on update.
    let mut h = Harness::new();
    stream_burst(&mut h);
    h.push(assistant_final("abc"));
    assert!(!h.coalescer.has_pending());
    assert!(h.wire.last().is_some_and(|e| e.kind == "update"));
    // No later timer tick may resurrect the dropped partial.
    h.advance(100);
    assert_eq!(h.wire.last().map(|e| e.kind), Some("update"));
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_partial_then_done_with_final_update() {
    // Real end-of-turn order: `handle_end_or_aborted` emits Update then
    // Done. The parked partial is dropped by the Update; Done follows.
    let mut h = Harness::new();
    stream_burst(&mut h);
    let final_messages = h.pipeline.finish();
    h.route(AgentStreamEvent::Update {
        messages: final_messages,
    });
    h.done();
    assert_no_partial_after_terminal(&h.wire);
    let kinds: Vec<_> = h.wire.iter().map(|e| e.kind).collect();
    assert_eq!(kinds, ["streamingPartial", "update", "done"]);
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_partial_then_bare_done_flushes_first() {
    // Defensive: a non-Update terminal with a parked partial flushes the
    // partial BEFORE the terminal event, never after.
    let mut h = Harness::new();
    stream_burst(&mut h);
    h.done();
    assert!(!h.coalescer.has_pending());
    assert_no_partial_after_terminal(&h.wire);
    let kinds: Vec<_> = h.wire.iter().map(|e| e.kind).collect();
    assert_eq!(kinds, ["streamingPartial", "streamingPartial", "done"]);
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_partial_then_error_flushes_first() {
    // Error has no preceding Update, so the latest partial ("abc") must
    // reach the wire ahead of it — same as the uncoalesced order.
    let mut h = Harness::new();
    stream_burst(&mut h);
    h.error("boom");
    assert!(!h.coalescer.has_pending());
    assert_no_partial_after_terminal(&h.wire);
    // Nothing may be flushed by a later tick either.
    h.advance(100);
    assert_eq!(h.wire.last().map(|e| e.kind), Some("error"));
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_continuous_burst_does_not_starve() {
    // Deltas every 5ms for 100ms with the trailing-edge timer NEVER
    // serviced in between (models a receive loop that always has an event
    // ready before the flush deadline). The in-`route` due check alone
    // must keep partials flowing at ~interval cadence, each carrying the
    // newest text; the final text is flushed by the trailing edge once
    // the burst ends.
    let mut h = Harness::new();
    h.push(text_block_start());
    for i in 0..20 {
        h.push(text_delta(&i.to_string()));
        h.now += Duration::from_millis(5); // no timer service
    }
    h.advance(100);
    assert!(!h.coalescer.has_pending());
    let last = h.wire.last().expect("partials emitted");
    assert_eq!(last.body, ["012345678910111213141516171819"]);
    assert!(
        h.wire.len() < 20 / 2,
        "burst should be thinned, got {} emits",
        h.wire.len()
    );
    assert_yaml_snapshot!(h.wire);
}

#[test]
fn coalesce_slow_stream_adds_no_latency() {
    // Deltas spaced wider than the interval are each sent immediately.
    let mut h = Harness::new();
    h.push(text_block_start());
    for word in ["slow ", "stream ", "here"] {
        h.push(text_delta(word));
        assert!(!h.coalescer.has_pending());
        h.advance(50);
    }
    assert_yaml_snapshot!(h.wire);
}
