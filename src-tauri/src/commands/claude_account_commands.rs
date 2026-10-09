//! Tauri commands for the multi-account Claude feature. Domain logic lives
//! in `crate::claude_accounts`; this file is IPC glue only.

use crate::claude_accounts::{self, detect::DetectedClaudeAccount};
use crate::db;

use super::common::{run_blocking, CmdResult};

/// Pick the Claude account for a session (`None` = default account). Rejected
/// once the session has messages — see `claude_accounts::session`.
#[tauri::command]
pub async fn set_session_claude_config_dir(
    session_id: String,
    config_dir: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || {
        let connection = db::write_conn()?;
        claude_accounts::session::set_session_config_dir(
            &connection,
            &session_id,
            config_dir.as_deref(),
        )
    })
    .await
}

/// Existing `~/.claude-*` config dirs worth offering as accounts.
#[tauri::command]
pub async fn detect_claude_config_dirs() -> CmdResult<Vec<DetectedClaudeAccount>> {
    run_blocking(|| Ok(claude_accounts::detect::detect())).await
}

/// Expand `~` and strip trailing slashes; errors on a relative path.
#[tauri::command]
pub async fn normalize_claude_config_dir(path: String) -> CmdResult<String> {
    run_blocking(move || claude_accounts::normalize_config_dir(&path)).await
}
