//! Helpers for Claude Code's per-cwd session storage layout.
//!
//! Claude Code persists each session as
//! `<config dir>/projects/<encoded-cwd>/<provider_session_id>.jsonl` plus an
//! optional sibling directory `<provider_session_id>/` that holds tool
//! results, subagent transcripts, etc. The encoded directory is derived
//! from the cwd, so any operation that changes a workspace's cwd
//! (local→worktree conversion, etc.) makes existing
//! sessions invisible to a `resume:` call until we copy the files into
//! the new project dir. `<config dir>` is `~/.claude` for the default account
//! or the session's `claude_config_dir` (`CLAUDE_CONFIG_DIR`) for others.

use std::path::{Path, PathBuf};

use crate::workspace::helpers as ws_helpers;

/// Encode a filesystem path into Claude Code's project directory name.
/// Claude uses `path.replace(/[\/.]/g, '-')`.
pub fn encode_project_dir(path: &Path) -> String {
    path.display().to_string().replace(['/', '.'], "-")
}

/// Resolve a Claude account's `projects` dir: `<config_dir>/projects`, or
/// `<home>/.claude/projects` for the default account (`None` / blank).
/// Returns `None` when the dir does not exist (fresh install / account
/// never used — nothing to do) or a non-default config dir is relative.
fn projects_root_for(config_dir: Option<&str>, home: Option<&Path>) -> Option<PathBuf> {
    let base = match config_dir.map(str::trim).filter(|dir| !dir.is_empty()) {
        Some(dir) => {
            let dir = PathBuf::from(dir);
            if !dir.is_absolute() {
                return None;
            }
            dir
        }
        None => home?.join(".claude"),
    };
    let root = base.join("projects");
    if root.is_dir() {
        Some(root)
    } else {
        None
    }
}

/// Migrate every `(claude_config_dir, provider_session_ids)` group using
/// that account's own projects root. Returns the total copied.
pub fn migrate_session_files_by_account(
    old_cwd: &Path,
    new_cwd: &Path,
    groups: &[(Option<String>, Vec<String>)],
) -> usize {
    let home = crate::platform::paths::home_dir();
    migrate_by_account_with_home(home.as_deref(), old_cwd, new_cwd, groups)
}

fn migrate_by_account_with_home(
    home: Option<&Path>,
    old_cwd: &Path,
    new_cwd: &Path,
    groups: &[(Option<String>, Vec<String>)],
) -> usize {
    groups
        .iter()
        .map(|(config_dir, ids)| {
            migrate_session_files_with_home(home, old_cwd, new_cwd, config_dir.as_deref(), ids)
        })
        .sum()
}

/// Copy the Claude session `.jsonl` (and matching `<id>/` subdirectory,
/// if present) for each provider session id from `old_cwd`'s project dir
/// into `new_cwd`'s project dir, under the projects root of the Claude
/// account `config_dir` (`None` = default `~/.claude`).
///
/// Best-effort: missing source files are skipped silently (Codex sessions,
/// fresh sessions with no first turn yet, sessions truncated by the user,
/// etc.). Per-file errors are logged and counted; this never returns an
/// error so callers can run it inline with their primary operation
/// without rollback.
///
/// Returns the number of session IDs whose `.jsonl` was successfully
/// copied (the sibling `<id>/` dir, if any, is copied opportunistically
/// and does not affect the returned count).
fn migrate_session_files_with_home(
    home: Option<&Path>,
    old_cwd: &Path,
    new_cwd: &Path,
    config_dir: Option<&str>,
    session_ids: &[String],
) -> usize {
    let Some(projects_root) = projects_root_for(config_dir, home) else {
        return 0;
    };
    migrate_session_files_at(&projects_root, old_cwd, new_cwd, session_ids)
}

/// Same as [`migrate_session_files_by_account`] but takes the projects root
/// explicitly. Exists for unit testing without env mutation.
pub(crate) fn migrate_session_files_at(
    projects_root: &Path,
    old_cwd: &Path,
    new_cwd: &Path,
    session_ids: &[String],
) -> usize {
    if session_ids.is_empty() || old_cwd == new_cwd {
        return 0;
    }

    let src_dir = projects_root.join(encode_project_dir(old_cwd));
    let dst_dir = projects_root.join(encode_project_dir(new_cwd));

    if !src_dir.is_dir() {
        return 0;
    }

    let mut copied = 0usize;
    for sid in session_ids {
        let jsonl_name = format!("{sid}.jsonl");
        let src_jsonl = src_dir.join(&jsonl_name);
        if !src_jsonl.is_file() {
            continue;
        }

        // Lazy-create dst. If creation fails, give up — every subsequent
        // copy would fail too.
        if !dst_dir.exists() {
            if let Err(error) = std::fs::create_dir_all(&dst_dir) {
                tracing::error!(
                    dst = %dst_dir.display(),
                    error = %error,
                    "Failed to create Claude project dir for session migration",
                );
                return copied;
            }
        }

        let dst_jsonl = dst_dir.join(&jsonl_name);
        match std::fs::copy(&src_jsonl, &dst_jsonl) {
            Ok(_) => copied += 1,
            Err(error) => {
                tracing::error!(
                    src = %src_jsonl.display(),
                    dst = %dst_jsonl.display(),
                    error = %error,
                    "Failed to copy Claude session jsonl",
                );
                continue;
            }
        }

        // Sibling dir holds tool results / subagent transcripts. Optional.
        let src_subdir = src_dir.join(sid);
        if src_subdir.is_dir() {
            let dst_subdir = dst_dir.join(sid);
            if dst_subdir.exists() {
                let _ = std::fs::remove_dir_all(&dst_subdir);
            }
            if let Err(error) = ws_helpers::copy_dir_all(&src_subdir, &dst_subdir) {
                tracing::warn!(
                    src = %src_subdir.display(),
                    dst = %dst_subdir.display(),
                    error = %error,
                    "Failed to copy Claude session sidecar dir",
                );
            }
        }
    }

    if copied > 0 {
        tracing::info!(
            count = copied,
            src = %src_dir.display(),
            dst = %dst_dir.display(),
            "Migrated Claude session files",
        );
    }
    copied
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn encode_project_dir_replaces_slashes_and_dots() {
        let path = PathBuf::from("/Users/me/old-app/workspaces/repo/ws");
        assert_eq!(
            encode_project_dir(&path),
            "-Users-me-old-app-workspaces-repo-ws"
        );

        let path2 = PathBuf::from("/Users/me/helmor-dev/workspaces/repo/ws");
        assert_eq!(
            encode_project_dir(&path2),
            "-Users-me-helmor-dev-workspaces-repo-ws"
        );
    }

    #[test]
    fn migrate_session_files_copies_only_listed_ids() {
        let projects = TempDir::new().unwrap();
        let old_cwd = PathBuf::from("/tmp/fake/local-repo");
        let new_cwd = PathBuf::from("/tmp/fake/worktree");

        let src = projects.path().join(encode_project_dir(&old_cwd));
        fs::create_dir_all(&src).unwrap();

        // Two sessions we own, plus a third unrelated session in the
        // same project dir (e.g. user ran `claude` from the terminal).
        fs::write(src.join("aaa.jsonl"), b"session-a-content").unwrap();
        fs::write(src.join("bbb.jsonl"), b"session-b-content").unwrap();
        fs::write(src.join("unrelated.jsonl"), b"DO NOT COPY").unwrap();
        // Sidecar dir for aaa with one tool-result file.
        fs::create_dir_all(src.join("aaa").join("tool-results")).unwrap();
        fs::write(src.join("aaa/tool-results/r1.json"), b"{}").unwrap();

        let copied = migrate_session_files_at(
            projects.path(),
            &old_cwd,
            &new_cwd,
            &["aaa".to_string(), "bbb".to_string()],
        );
        assert_eq!(copied, 2);

        let dst = projects.path().join(encode_project_dir(&new_cwd));
        assert!(dst.join("aaa.jsonl").is_file());
        assert!(dst.join("bbb.jsonl").is_file());
        assert!(
            !dst.join("unrelated.jsonl").exists(),
            "must not leak unrelated session files",
        );
        assert!(
            dst.join("aaa/tool-results/r1.json").is_file(),
            "sidecar dir for the migrated session should be copied",
        );
    }

    #[test]
    fn migrate_session_files_skips_missing_source_jsonls() {
        let projects = TempDir::new().unwrap();
        let old_cwd = PathBuf::from("/tmp/fake/a");
        let new_cwd = PathBuf::from("/tmp/fake/b");

        let src = projects.path().join(encode_project_dir(&old_cwd));
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("present.jsonl"), b"ok").unwrap();

        // Asking to migrate one present + one absent id: only the
        // present one should land in dst, no error.
        let copied = migrate_session_files_at(
            projects.path(),
            &old_cwd,
            &new_cwd,
            &["present".to_string(), "absent".to_string()],
        );
        assert_eq!(copied, 1);

        let dst = projects.path().join(encode_project_dir(&new_cwd));
        assert!(dst.join("present.jsonl").is_file());
        assert!(!dst.join("absent.jsonl").exists());
    }

    #[test]
    fn migrate_session_files_is_noop_when_source_dir_missing() {
        let projects = TempDir::new().unwrap();
        let copied = migrate_session_files_at(
            projects.path(),
            &PathBuf::from("/tmp/fake/a"),
            &PathBuf::from("/tmp/fake/b"),
            &["xxx".to_string()],
        );
        assert_eq!(copied, 0);
    }

    #[test]
    fn migrate_session_files_is_noop_when_cwd_unchanged() {
        let projects = TempDir::new().unwrap();
        let same = PathBuf::from("/tmp/fake/repo");
        let dir = projects.path().join(encode_project_dir(&same));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("xxx.jsonl"), b"_").unwrap();

        assert_eq!(
            migrate_session_files_at(projects.path(), &same, &same, &["xxx".to_string()]),
            0
        );
    }

    fn write_session(projects: &Path, cwd: &Path, id: &str, body: &[u8]) {
        let dir = projects.join(encode_project_dir(cwd));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("{id}.jsonl")), body).unwrap();
    }

    #[test]
    fn projects_root_default_uses_home_dot_claude() {
        let home = TempDir::new().unwrap();
        // Missing dir -> None (fresh install).
        assert_eq!(projects_root_for(None, Some(home.path())), None);
        let root = home.path().join(".claude").join("projects");
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            projects_root_for(None, Some(home.path())),
            Some(root.clone())
        );
        // Blank config dir is the default account too.
        assert_eq!(projects_root_for(Some("  "), Some(home.path())), Some(root));
        // No HOME -> None.
        assert_eq!(projects_root_for(None, None), None);
    }

    #[test]
    fn projects_root_for_account_uses_config_dir_projects() {
        let home = TempDir::new().unwrap();
        let account = TempDir::new().unwrap();
        assert_eq!(
            projects_root_for(account.path().to_str(), Some(home.path())),
            None
        );
        let root = account.path().join("projects");
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            projects_root_for(account.path().to_str(), Some(home.path())),
            Some(root.clone())
        );
        // Works without HOME, and a relative dir is rejected.
        assert_eq!(projects_root_for(account.path().to_str(), None), Some(root));
        assert_eq!(
            projects_root_for(Some("relative/dir"), Some(home.path())),
            None
        );
    }

    #[test]
    fn migrate_by_account_uses_each_accounts_projects_root() {
        let home = TempDir::new().unwrap();
        let account = TempDir::new().unwrap();
        let default_root = home.path().join(".claude").join("projects");
        let account_root = account.path().join("projects");
        let old_cwd = PathBuf::from("/tmp/fake/repo");
        let new_cwd = PathBuf::from("/tmp/fake/repo-worktree");

        write_session(&default_root, &old_cwd, "def1", b"default");
        write_session(&account_root, &old_cwd, "acc1", b"account");
        // Same id nowhere else: must not leak across accounts.
        write_session(&account_root, &old_cwd, "def-only-in-account", b"x");

        let account_dir = account.path().to_str().unwrap().to_string();
        let groups = vec![
            (None, vec!["def1".to_string()]),
            (Some(account_dir), vec!["acc1".to_string()]),
        ];
        let copied = migrate_by_account_with_home(Some(home.path()), &old_cwd, &new_cwd, &groups);
        assert_eq!(copied, 2);

        let new_enc = encode_project_dir(&new_cwd);
        assert_eq!(
            fs::read(default_root.join(&new_enc).join("def1.jsonl")).unwrap(),
            b"default"
        );
        assert_eq!(
            fs::read(account_root.join(&new_enc).join("acc1.jsonl")).unwrap(),
            b"account"
        );
        // Each account only received its own sessions.
        assert!(!default_root.join(&new_enc).join("acc1.jsonl").exists());
        assert!(!account_root.join(&new_enc).join("def1.jsonl").exists());
        assert!(!account_root
            .join(&new_enc)
            .join("def-only-in-account.jsonl")
            .exists());
    }

    #[test]
    fn migrate_default_account_matches_previous_behaviour() {
        let home = TempDir::new().unwrap();
        let root = home.path().join(".claude").join("projects");
        let old_cwd = PathBuf::from("/tmp/fake/a");
        let new_cwd = PathBuf::from("/tmp/fake/b");
        write_session(&root, &old_cwd, "aaa", b"1");
        fs::create_dir_all(root.join(encode_project_dir(&old_cwd)).join("aaa")).unwrap();
        fs::write(
            root.join(encode_project_dir(&old_cwd)).join("aaa/r.json"),
            b"{}",
        )
        .unwrap();

        let copied = migrate_session_files_with_home(
            Some(home.path()),
            &old_cwd,
            &new_cwd,
            None,
            &["aaa".to_string()],
        );
        assert_eq!(copied, 1);
        let dst = root.join(encode_project_dir(&new_cwd));
        assert!(dst.join("aaa.jsonl").is_file());
        assert!(dst.join("aaa/r.json").is_file());
    }

    #[test]
    fn migrate_skips_account_without_projects_dir() {
        let home = TempDir::new().unwrap();
        let account = TempDir::new().unwrap(); // no projects/ inside
        let copied = migrate_session_files_with_home(
            Some(home.path()),
            &PathBuf::from("/tmp/fake/a"),
            &PathBuf::from("/tmp/fake/b"),
            account.path().to_str(),
            &["aaa".to_string()],
        );
        assert_eq!(copied, 0);
    }
}
