//! Process-global mirror of the running `llama-server` endpoint.
//!
//! `Manager` is Tauri-managed state, so only code holding an `AppHandle`
//! can reach it. The agent catalog (`agents/catalog.rs`, `provider/codex.rs`)
//! is plain sync code with no handle, yet it must know the live base URL +
//! bearer token to expose the local model in the composer picker.
//!
//! `Manager` publishes here on every successful start and clears on stop /
//! crash-reap, so `current()` never hands out a stale port.

use std::sync::{Mutex, OnceLock};

use super::settings::Endpoint;

fn slot() -> &'static Mutex<Option<Endpoint>> {
    static SLOT: OnceLock<Mutex<Option<Endpoint>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Record the live endpoint (or `None` when the server goes away).
pub(super) fn publish(endpoint: Option<Endpoint>) {
    *slot().lock().unwrap_or_else(|p| p.into_inner()) = endpoint;
}

/// The live endpoint, or `None` while stopped / starting / crashed.
pub fn current() -> Option<Endpoint> {
    slot()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
        .cloned()
}
