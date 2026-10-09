//! Turn start for the on-device model: make sure the bundled llama-server is
//! running the selected GGUF and has finished loading, then hand its loopback
//! endpoint to the Claude agent. Any failure is a user-facing error on the
//! send itself — a local session never falls back to a cloud model.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

/// Pending local starts, keyed by Helmor session id, so Stop can cancel a
/// turn that is still waiting for the model to load.
static PENDING: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Registration of one pending start; unregisters on drop.
struct PendingStart {
    key: Option<String>,
    cancel: Arc<AtomicBool>,
}

impl PendingStart {
    fn register(session_id: Option<&str>) -> Self {
        let cancel = Arc::new(AtomicBool::new(false));
        if let Some(key) = session_id {
            PENDING
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .insert(key.to_string(), Arc::clone(&cancel));
        }
        Self {
            key: session_id.map(str::to_string),
            cancel,
        }
    }
}

impl Drop for PendingStart {
    fn drop(&mut self) {
        if let Some(key) = &self.key {
            let mut pending = PENDING.lock().unwrap_or_else(|p| p.into_inner());
            // Only remove our own entry; a newer start may share the key.
            if pending
                .get(key)
                .is_some_and(|flag| Arc::ptr_eq(flag, &self.cancel))
            {
                pending.remove(key);
            }
        }
    }
}

/// Cancel a local start still waiting on the model. Returns whether one was
/// pending for this session.
pub fn cancel_pending_local_start(session_id: &str) -> bool {
    match PENDING
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(session_id)
    {
        Some(flag) => {
            flag.store(true, Ordering::SeqCst);
            true
        }
        None => false,
    }
}

/// Isolated Claude config dir for local turns (created on demand).
pub fn local_claude_config_dir() -> Result<PathBuf> {
    let dir = crate::data_dir::data_dir()?
        .join("local-llm")
        .join("claude-home");
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("create local agent config dir {}", dir.display()))?;
    Ok(dir)
}

/// Whether a Claude conversation id lives in the local agent's isolated
/// history (`<config>/projects/<project>/<id>.jsonl`).
pub fn local_history_has(conversation_id: &str) -> bool {
    let Ok(dir) = crate::data_dir::data_dir() else {
        return false;
    };
    history_dir_has(
        &dir.join("local-llm").join("claude-home").join("projects"),
        conversation_id,
    )
}

fn history_dir_has(projects: &std::path::Path, conversation_id: &str) -> bool {
    if conversation_id.is_empty() || conversation_id.contains(['/', '\\', '.']) {
        return false;
    }
    let file = format!("{conversation_id}.jsonl");
    std::fs::read_dir(projects)
        .map(|entries| {
            entries
                .flatten()
                .any(|entry| entry.path().join(&file).is_file())
        })
        .unwrap_or(false)
}

/// Start (or reuse) the local model and wait until it can take a turn.
pub async fn ensure_local_for_turn(
    app: &AppHandle,
    helmor_session_id: Option<&str>,
) -> Result<crate::local_llm::AgentEndpoint> {
    let pending = PendingStart::register(helmor_session_id);
    let cancel = Arc::clone(&pending.cancel);
    let app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::local_llm::Manager>()
            .ensure_agent_endpoint(&cancel)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Local model start task failed: {e}"))?;
    drop(pending);
    result.map_err(user_facing_error)
}

fn user_facing_error(error: anyhow::Error) -> anyhow::Error {
    if error
        .downcast_ref::<crate::local_llm::StartCancelled>()
        .is_some()
    {
        return anyhow::anyhow!("Stopped before the local model finished loading.");
    }
    anyhow::anyhow!("Local model unavailable: {error:#}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_cancels_only_while_pending() {
        let pending = PendingStart::register(Some("sess-local-cancel"));
        assert!(!pending.cancel.load(Ordering::SeqCst));
        assert!(cancel_pending_local_start("sess-local-cancel"));
        assert!(pending.cancel.load(Ordering::SeqCst));
        drop(pending);
        assert!(!cancel_pending_local_start("sess-local-cancel"));
    }

    #[test]
    fn newer_start_survives_older_drop() {
        let older = PendingStart::register(Some("sess-local-overlap"));
        let newer = PendingStart::register(Some("sess-local-overlap"));
        drop(older);
        assert!(cancel_pending_local_start("sess-local-overlap"));
        assert!(newer.cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn finds_local_history_by_conversation_id() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("-Users-me-repo");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("abc-123.jsonl"), "{}").unwrap();
        assert!(history_dir_has(dir.path(), "abc-123"));
        assert!(!history_dir_has(dir.path(), "zzz-999"));
        assert!(!history_dir_has(dir.path(), "../abc-123"));
        assert!(!history_dir_has(&dir.path().join("missing"), "abc-123"));
    }

    #[test]
    fn errors_are_user_facing() {
        let cancelled = user_facing_error(crate::local_llm::StartCancelled.into());
        assert_eq!(
            cancelled.to_string(),
            "Stopped before the local model finished loading."
        );
        let failed = user_facing_error(anyhow::anyhow!("Local LLM is turned off."));
        assert!(failed.to_string().starts_with("Local model unavailable:"));
    }
}
