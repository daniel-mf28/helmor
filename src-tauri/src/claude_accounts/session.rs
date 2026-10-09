//! Per-session Claude account storage (`sessions.claude_config_dir`).
//!
//! A Claude session's transcript lives under its config dir, so it can only
//! be resumed with the account it started on. The column is therefore
//! writable only while the session has no messages yet.

use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OptionalExtension};

use super::accounts::same_config_dir;
use super::paths::normalize_config_dir;
use crate::models::{db, settings};

/// App-level setting: the account new sessions start on (the last one the
/// user picked). Empty / absent = default account.
pub const LAST_CONFIG_DIR_KEY: &str = "app.claude_last_config_dir";

/// The account new sessions should start on, or `None` for the default.
pub fn last_used_config_dir() -> Option<String> {
    settings::load_setting_value(LAST_CONFIG_DIR_KEY)
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Config dir stored on a session (`None` = default account / unknown
/// session). DB failures degrade to `None` (default) but are logged.
pub fn lookup_session_config_dir(helmor_session_id: Option<&str>) -> Option<String> {
    let hsid = helmor_session_id?;
    let conn = match db::read_conn() {
        Ok(conn) => conn,
        Err(error) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %error,
                "Failed to open DB for claude config dir lookup; using default account",
            );
            return None;
        }
    };
    match read_session_config_dir(&conn, hsid) {
        Ok(dir) => dir,
        Err(error) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %error,
                "claude_config_dir query failed; using default account",
            );
            None
        }
    }
}

fn read_session_config_dir(conn: &Connection, session_id: &str) -> Result<Option<String>> {
    let value: Option<Option<String>> = conn
        .query_row(
            "SELECT claude_config_dir FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.flatten().filter(|dir| !dir.trim().is_empty()))
}

fn session_message_count(conn: &Connection, session_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM session_messages WHERE session_id = ?1",
        [session_id],
        |row| row.get(0),
    )
    .context("Failed to count session messages")
}

/// Set (or clear, with `None`) a session's account. Refuses once the session
/// has any message: the account is then fixed for the life of the chat.
pub fn set_session_config_dir(
    conn: &Connection,
    session_id: &str,
    config_dir: Option<&str>,
) -> Result<()> {
    let normalized = match config_dir.map(str::trim).filter(|dir| !dir.is_empty()) {
        Some(dir) => Some(normalize_config_dir(dir)?),
        None => None,
    };
    if session_message_count(conn, session_id)? > 0 {
        bail!("The Claude account is fixed once a chat has messages. Start a new chat to switch.");
    }
    let updated = conn
        .execute(
            "UPDATE sessions SET claude_config_dir = ?2 WHERE id = ?1",
            rusqlite::params![session_id, normalized],
        )
        .context("Failed to update session claude_config_dir")?;
    if updated == 0 {
        bail!("Session {session_id} does not exist");
    }
    Ok(())
}

/// Ensure a session runs on `desired` (`None` = default account), for callers
/// that name the account explicitly (the CLI). Unlike
/// [`set_session_config_dir`], asking for the account the session already has
/// is a no-op even once it has messages; only an actual switch is refused.
/// Returns whether the stored account changed.
pub fn assign_session_config_dir(
    conn: &Connection,
    session_id: &str,
    desired: Option<&str>,
) -> Result<bool> {
    let desired = desired.map(str::trim).filter(|dir| !dir.is_empty());
    let current = read_session_config_dir(conn, session_id)?;
    if same_config_dir(current.as_deref(), desired) {
        return Ok(false);
    }
    if session_message_count(conn, session_id)? > 0 {
        bail!(
            "The Claude account is fixed for this chat: it already has messages on {}. \
             Start a new session to use a different account.",
            current.as_deref().unwrap_or("the default account"),
        );
    }
    set_session_config_dir(conn, session_id, desired)?;
    Ok(true)
}

/// [`assign_session_config_dir`] on a fresh write connection, for the CLI.
/// Deliberately does NOT touch the app's last-used account: an orchestrating
/// agent creating a Personal chat must not change which account the user's
/// own next chat starts on. Returns whether the stored account changed.
pub fn assign_on_write_conn(session_id: &str, desired: Option<&str>) -> Result<bool> {
    let conn = db::write_conn()?;
    assign_session_config_dir(&conn, session_id, desired)
}

// Unix-only: fixtures use POSIX absolute paths ("/tmp/...", "/Users/..."),
// which are relative on Windows. The keychain naming they pin is macOS-only.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO sessions (id, status) VALUES ('s1', 'idle')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn set_then_read_round_trips_and_clears() {
        let conn = test_conn();
        set_session_config_dir(&conn, "s1", Some("/tmp/claude-x/")).unwrap();
        assert_eq!(
            read_session_config_dir(&conn, "s1").unwrap().as_deref(),
            Some("/tmp/claude-x")
        );
        set_session_config_dir(&conn, "s1", None).unwrap();
        assert_eq!(read_session_config_dir(&conn, "s1").unwrap(), None);
    }

    #[test]
    fn locked_once_session_has_messages() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO session_messages (id, session_id, role, content) VALUES ('m1', 's1', 'user', '{}')",
            [],
        )
        .unwrap();
        let error = set_session_config_dir(&conn, "s1", Some("/tmp/claude-x")).unwrap_err();
        assert!(error.to_string().contains("fixed"));
        assert_eq!(read_session_config_dir(&conn, "s1").unwrap(), None);
    }

    fn add_message(conn: &Connection) {
        conn.execute(
            "INSERT INTO session_messages (id, session_id, role, content) VALUES ('m1', 's1', 'user', '{}')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn assign_switches_a_fresh_session_and_reports_change() {
        let conn = test_conn();
        assert!(assign_session_config_dir(&conn, "s1", Some("/tmp/claude-x")).unwrap());
        assert_eq!(
            read_session_config_dir(&conn, "s1").unwrap().as_deref(),
            Some("/tmp/claude-x")
        );
        // Same account again: no change. Back to default: change.
        assert!(!assign_session_config_dir(&conn, "s1", Some("/tmp/claude-x/")).unwrap());
        assert!(assign_session_config_dir(&conn, "s1", None).unwrap());
        assert_eq!(read_session_config_dir(&conn, "s1").unwrap(), None);
    }

    #[test]
    fn assign_refuses_to_switch_a_session_with_messages() {
        let conn = test_conn();
        assign_session_config_dir(&conn, "s1", Some("/tmp/claude-x")).unwrap();
        add_message(&conn);
        let error = assign_session_config_dir(&conn, "s1", None).unwrap_err();
        let message = error.to_string();
        assert!(message.contains("fixed for this chat"), "{message}");
        assert!(message.contains("/tmp/claude-x"), "{message}");
        assert!(message.contains("new session"), "{message}");
        assert_eq!(
            read_session_config_dir(&conn, "s1").unwrap().as_deref(),
            Some("/tmp/claude-x")
        );
    }

    #[test]
    fn assign_to_the_same_account_is_fine_on_a_locked_session() {
        let conn = test_conn();
        add_message(&conn);
        // Default account -> default account.
        assert!(!assign_session_config_dir(&conn, "s1", None).unwrap());
        assert!(assign_session_config_dir(&conn, "s1", Some("/tmp/x")).is_err());
    }

    #[test]
    fn rejects_relative_dir_and_unknown_session() {
        let conn = test_conn();
        assert!(set_session_config_dir(&conn, "s1", Some("relative")).is_err());
        assert!(set_session_config_dir(&conn, "nope", Some("/tmp/x")).is_err());
    }
}
