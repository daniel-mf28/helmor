//! Bounded, cancellable readiness wait for a freshly started llama-server.
//!
//! The process answering `/v1/models` does not mean the weights are loaded;
//! llama-server's `/health` returns 503 until the model is ready. A coding
//! turn must not reach the agent before that, or the first prompt fails.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

use anyhow::Result;

/// Upper bound for a cold model load before the turn is failed.
pub(super) const READY_TIMEOUT: Duration = Duration::from_secs(180);
pub(super) const READY_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// One readiness observation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Probe {
    Ready,
    /// Server alive but not ready yet (loading / not answering yet).
    Loading(String),
    /// Server is gone; waiting longer is pointless.
    Dead(String),
}

/// The caller cancelled (Stop) while the model was starting.
#[derive(Debug)]
pub struct StartCancelled;

impl std::fmt::Display for StartCancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Local model start cancelled")
    }
}

impl std::error::Error for StartCancelled {}

pub(super) fn wait_until_ready(
    mut probe: impl FnMut() -> Probe,
    cancel: &AtomicBool,
    timeout: Duration,
    interval: Duration,
) -> Result<()> {
    let started = Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(StartCancelled.into());
        }
        match probe() {
            Probe::Ready => return Ok(()),
            Probe::Dead(reason) => anyhow::bail!("Local model server stopped: {reason}"),
            Probe::Loading(detail) => {
                if started.elapsed() >= timeout {
                    anyhow::bail!(
                        "Timed out after {}s waiting for the local model to finish loading ({detail})",
                        timeout.as_secs()
                    );
                }
            }
        }
        std::thread::sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: Duration = Duration::from_millis(1);

    #[test]
    fn ready_after_loading() {
        let mut calls = 0;
        let cancel = AtomicBool::new(false);
        let result = wait_until_ready(
            || {
                calls += 1;
                if calls < 3 {
                    Probe::Loading("HTTP 503".into())
                } else {
                    Probe::Ready
                }
            },
            &cancel,
            Duration::from_secs(5),
            FAST,
        );
        assert!(result.is_ok());
        assert_eq!(calls, 3);
    }

    #[test]
    fn times_out_with_clear_message() {
        let cancel = AtomicBool::new(false);
        let error = wait_until_ready(
            || Probe::Loading("HTTP 503".into()),
            &cancel,
            Duration::from_millis(20),
            FAST,
        )
        .unwrap_err();
        let text = format!("{error:#}");
        assert!(text.contains("Timed out"), "{text}");
        assert!(text.contains("HTTP 503"), "{text}");
    }

    #[test]
    fn dead_server_fails_fast() {
        let cancel = AtomicBool::new(false);
        let error = wait_until_ready(
            || Probe::Dead("exited".into()),
            &cancel,
            Duration::from_secs(60),
            FAST,
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("stopped: exited"));
    }

    #[test]
    fn cancel_is_reported_as_start_cancelled() {
        let cancel = AtomicBool::new(true);
        let error = wait_until_ready(
            || Probe::Loading("x".into()),
            &cancel,
            Duration::from_secs(60),
            FAST,
        )
        .unwrap_err();
        assert!(error.downcast_ref::<StartCancelled>().is_some());
    }
}
