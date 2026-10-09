//! The configured Claude account list, and resolving a user-typed account
//! (`Work`, `~/.claude-personal`, `default`) to a config dir.
//!
//! Mirrors `src/features/claude-accounts/accounts.ts`: the built-in default
//! account (`config_dir == None`) always comes first, followed by the extras
//! stored as JSON under `app.claude_accounts`.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use super::paths::{expand_config_dir, normalize_config_dir};
use crate::models::settings;

/// App setting holding the JSON list of extra accounts `[{id,label,configDir}]`.
pub const ACCOUNTS_KEY: &str = "app.claude_accounts";
/// App setting holding the default account's display name.
pub const DEFAULT_LABEL_KEY: &str = "app.claude_default_account_label";
/// Label of the default account when `DEFAULT_LABEL_KEY` is unset.
pub const DEFAULT_ACCOUNT_LABEL: &str = "Work";
/// CLI keyword meaning "the default account" (stored as NULL).
pub const DEFAULT_KEYWORD: &str = "default";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccount {
    pub id: String,
    pub label: String,
    /// Absolute `CLAUDE_CONFIG_DIR`; `None` = the built-in default account.
    pub config_dir: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAccount {
    id: Option<String>,
    label: Option<String>,
    config_dir: Option<String>,
}

/// Parse the stored JSON list. Malformed input yields an empty list; entries
/// without a label or dir, and duplicate dirs, are skipped (same rules as the
/// frontend's `parseClaudeAccounts`).
fn parse_extra_accounts(raw: Option<&str>) -> Vec<ClaudeAccount> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let Ok(stored) = serde_json::from_str::<Vec<StoredAccount>>(raw) else {
        return Vec::new();
    };
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for item in stored {
        let dir = item.config_dir.as_deref().map(str::trim).unwrap_or("");
        let label = item.label.as_deref().map(str::trim).unwrap_or("");
        if dir.is_empty() || label.is_empty() || !seen.insert(dir.to_string()) {
            continue;
        }
        let id = item
            .id
            .filter(|id| !id.is_empty())
            .unwrap_or_else(|| dir.to_string());
        out.push(ClaudeAccount {
            id,
            label: label.to_string(),
            config_dir: Some(dir.to_string()),
        });
    }
    out
}

/// Default account first, then the stored extras.
pub fn build_accounts(
    default_label: Option<&str>,
    accounts_json: Option<&str>,
) -> Vec<ClaudeAccount> {
    let label = default_label
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .unwrap_or(DEFAULT_ACCOUNT_LABEL);
    let mut accounts = vec![ClaudeAccount {
        id: DEFAULT_KEYWORD.to_string(),
        label: label.to_string(),
        config_dir: None,
    }];
    accounts.extend(parse_extra_accounts(accounts_json));
    accounts
}

/// Load the configured accounts from the settings table.
pub fn load_accounts() -> Result<Vec<ClaudeAccount>> {
    let default_label = settings::load_setting_value(DEFAULT_LABEL_KEY)?;
    let accounts_json = settings::load_setting_value(ACCOUNTS_KEY)?;
    Ok(build_accounts(
        default_label.as_deref(),
        accounts_json.as_deref(),
    ))
}

/// Two config dirs are the same account if they expand to the same absolute
/// path (`~/x` == `/Users/me/x`, trailing slashes ignored).
pub fn same_config_dir(a: Option<&str>, b: Option<&str>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => match (expand_config_dir(a), expand_config_dir(b)) {
            (Some(a), Some(b)) => a == b,
            _ => a.trim() == b.trim(),
        },
        _ => false,
    }
}

/// Display label for a stored config dir. A dir that is no longer configured
/// is labelled by its folder name (as the app does), so a chat still shows
/// where it really runs.
pub fn label_for_config_dir(accounts: &[ClaudeAccount], config_dir: Option<&str>) -> String {
    let dir = config_dir.map(str::trim).filter(|dir| !dir.is_empty());
    if let Some(found) = accounts
        .iter()
        .find(|account| same_config_dir(account.config_dir.as_deref(), dir))
    {
        return found.label.clone();
    }
    match dir {
        // Unreachable with `build_accounts` (it always has the default).
        None => "Default".to_string(),
        Some(dir) => dir
            .split(['/', '\\'])
            .rfind(|part| !part.is_empty())
            .unwrap_or(dir)
            .to_string(),
    }
}

/// Resolve the value of a `--claude-account` flag to a config dir
/// (`None` = default account, stored as NULL).
///
/// - `default` (any case) or the default account's own label -> `None`
/// - a configured account label, case-insensitively -> its config dir
/// - an absolute or `~` path -> normalized path
/// - anything else is an error listing the valid labels
pub fn resolve_account_arg(accounts: &[ClaudeAccount], input: &str) -> Result<Option<String>> {
    let input = input.trim();
    if input.is_empty() {
        bail!(
            "--claude-account cannot be empty. {}",
            valid_values(accounts)
        );
    }
    if input.eq_ignore_ascii_case(DEFAULT_KEYWORD) {
        return Ok(None);
    }
    if let Some(account) = accounts
        .iter()
        .find(|account| account.label.eq_ignore_ascii_case(input))
    {
        return Ok(account.config_dir.clone());
    }
    if input.starts_with(['/', '~', '\\']) || std::path::Path::new(input).is_absolute() {
        return normalize_config_dir(input).map(Some);
    }
    bail!(
        "Unknown Claude account '{input}'. {}",
        valid_values(accounts)
    )
}

fn valid_values(accounts: &[ClaudeAccount]) -> String {
    let labels = accounts
        .iter()
        .map(|account| {
            if account.config_dir.is_none() {
                format!("{} (default)", account.label)
            } else {
                account.label.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "Valid accounts: {labels}. You can also pass 'default' or an absolute (or ~/) config folder path."
    )
}

// Unix-only: fixtures use POSIX absolute paths ("/tmp/...", "/Users/..."),
// which are relative on Windows.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    const JSON: &str = r#"[
        {"id":"p","label":"Personal","configDir":"/Users/me/.claude-personal"},
        {"id":"x","label":"Team A","configDir":"/Users/me/.claude-team-a"}
    ]"#;

    fn accounts() -> Vec<ClaudeAccount> {
        build_accounts(None, Some(JSON))
    }

    #[test]
    fn default_account_comes_first_and_is_labelled_work() {
        let all = accounts();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].label, "Work");
        assert_eq!(all[0].config_dir, None);
        assert_eq!(all[1].label, "Personal");
        assert_eq!(
            build_accounts(Some(" Main "), None)[0].label,
            "Main",
            "custom default label wins, trimmed"
        );
        assert_eq!(build_accounts(Some("  "), None)[0].label, "Work");
    }

    #[test]
    fn parsing_skips_malformed_and_duplicate_entries() {
        let json = r#"[
            {"label":"A","configDir":"/a"},
            {"label":"A again","configDir":"/a"},
            {"label":"","configDir":"/b"},
            {"label":"C","configDir":""},
            {"label":"D"}
        ]"#;
        let all = build_accounts(None, Some(json));
        assert_eq!(all.len(), 2);
        assert_eq!(all[1].id, "/a", "id falls back to the config dir");
        assert_eq!(build_accounts(None, Some("not json")).len(), 1);
    }

    #[test]
    fn label_resolves_case_insensitively() {
        let all = accounts();
        assert_eq!(
            resolve_account_arg(&all, "personal").unwrap().as_deref(),
            Some("/Users/me/.claude-personal")
        );
        assert_eq!(
            resolve_account_arg(&all, " TEAM A ").unwrap().as_deref(),
            Some("/Users/me/.claude-team-a")
        );
    }

    #[test]
    fn default_keyword_and_default_label_resolve_to_null() {
        let all = accounts();
        assert_eq!(resolve_account_arg(&all, "default").unwrap(), None);
        assert_eq!(resolve_account_arg(&all, "DEFAULT").unwrap(), None);
        assert_eq!(resolve_account_arg(&all, "work").unwrap(), None);
    }

    #[test]
    fn absolute_and_tilde_paths_are_normalized() {
        let all = accounts();
        assert_eq!(
            resolve_account_arg(&all, "/opt/claude-x/")
                .unwrap()
                .as_deref(),
            Some("/opt/claude-x")
        );
        if let Some(home) = crate::platform::paths::home_dir() {
            assert_eq!(
                resolve_account_arg(&all, "~/.claude-new")
                    .unwrap()
                    .as_deref(),
                Some(home.join(".claude-new").to_string_lossy().as_ref())
            );
        }
    }

    #[test]
    fn unknown_label_errors_and_lists_valid_accounts() {
        let error = resolve_account_arg(&accounts(), "nope").unwrap_err();
        let message = error.to_string();
        assert!(
            message.contains("Unknown Claude account 'nope'"),
            "{message}"
        );
        assert!(message.contains("Work (default)"), "{message}");
        assert!(message.contains("Personal"), "{message}");
        assert!(message.contains("Team A"), "{message}");
    }

    #[test]
    fn relative_path_and_blank_are_rejected() {
        assert!(resolve_account_arg(&accounts(), "relative/dir").is_err());
        assert!(resolve_account_arg(&accounts(), "  ").is_err());
    }

    #[test]
    fn labels_for_stored_dirs() {
        let all = accounts();
        assert_eq!(label_for_config_dir(&all, None), "Work");
        assert_eq!(
            label_for_config_dir(&all, Some("/Users/me/.claude-personal/")),
            "Personal"
        );
        // Removed account: falls back to the folder name.
        assert_eq!(
            label_for_config_dir(&all, Some("/Users/me/.claude-gone")),
            ".claude-gone"
        );
    }
}
