//! Pure path helpers for Claude config dirs.

use std::path::{Path, PathBuf};

use anyhow::{bail, Result};
use sha2::{Digest, Sha256};

/// Keychain service Claude Code uses when `CLAUDE_CONFIG_DIR` is unset.
pub const DEFAULT_KEYCHAIN_SERVICE: &str = "Claude Code-credentials";

/// Expand a user-supplied config dir (`~`, `~/x`, trailing slashes) into an
/// absolute path. Returns `None` for blank input or a path that is still
/// relative after expansion — Claude Code's keychain hash is computed over an
/// absolute path, so a relative one can never match.
pub fn expand_config_dir(raw: &str) -> Option<PathBuf> {
    expand_with_home(raw, crate::platform::paths::home_dir().as_deref())
}

fn expand_with_home(raw: &str, home: Option<&Path>) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let expanded = if trimmed == "~" {
        home?.to_path_buf()
    } else if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        home?.join(rest)
    } else {
        PathBuf::from(trimmed)
    };
    if !expanded.is_absolute() {
        return None;
    }
    Some(strip_trailing_separators(expanded))
}

fn strip_trailing_separators(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() || trimmed == text {
        // Root ("/") or already clean.
        return path;
    }
    PathBuf::from(trimmed)
}

/// Normalize a config dir for storage: expanded absolute path as a string.
pub fn normalize_config_dir(raw: &str) -> Result<String> {
    match expand_config_dir(raw) {
        Some(path) => Ok(path.to_string_lossy().into_owned()),
        None => bail!("Claude config folder must be an absolute path (or start with ~/)"),
    }
}

/// macOS keychain service name Claude Code stores its OAuth credentials
/// under. Default account: `Claude Code-credentials`. With `CLAUDE_CONFIG_DIR`
/// set: that name plus `-` and the first 8 hex chars of
/// `sha256(<absolute config dir, no trailing slash>)`.
pub fn keychain_service_name(config_dir: Option<&str>) -> String {
    match config_dir_hash(config_dir) {
        Some(hash) => format!("{DEFAULT_KEYCHAIN_SERVICE}-{hash}"),
        None => DEFAULT_KEYCHAIN_SERVICE.to_string(),
    }
}

/// First 8 hex chars of `sha256(<absolute config dir>)`; `None` for the
/// default account (blank / unusable dir).
fn config_dir_hash(config_dir: Option<&str>) -> Option<String> {
    let dir = config_dir.and_then(expand_config_dir)?;
    let digest = Sha256::digest(dir.to_string_lossy().as_bytes());
    Some(hex::encode(digest)[..8].to_string())
}

/// `settings` key holding the cached usage body for an account. The default
/// account keeps the historical key so existing caches stay valid.
pub fn rate_limits_setting_key(config_dir: Option<&str>) -> String {
    let base = crate::models::settings::CLAUDE_RATE_LIMITS_KEY;
    match config_dir_hash(config_dir) {
        Some(hash) => format!("{base}.{hash}"),
        None => base.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_account_uses_plain_service_name() {
        assert_eq!(keychain_service_name(None), "Claude Code-credentials");
        assert_eq!(keychain_service_name(Some("")), "Claude Code-credentials");
        assert_eq!(
            keychain_service_name(Some("   ")),
            "Claude Code-credentials"
        );
    }

    #[test]
    fn custom_dir_appends_first_eight_sha256_hex_chars() {
        // Verified against the real keychain item on a dev machine.
        assert_eq!(
            keychain_service_name(Some("/Users/daniel/.claude-personal")),
            "Claude Code-credentials-ce119014"
        );
    }

    #[test]
    fn rate_limits_cache_key_is_per_account() {
        assert_eq!(rate_limits_setting_key(None), "app.claude_rate_limits");
        assert_eq!(
            rate_limits_setting_key(Some("/Users/daniel/.claude-personal")),
            "app.claude_rate_limits.ce119014"
        );
    }

    #[test]
    fn trailing_slash_does_not_change_the_hash() {
        assert_eq!(
            keychain_service_name(Some("/Users/daniel/.claude-personal/")),
            keychain_service_name(Some("/Users/daniel/.claude-personal")),
        );
    }

    #[test]
    fn tilde_and_expanded_dir_share_a_service_name() {
        let Some(home) = crate::platform::paths::home_dir() else {
            return;
        };
        let expanded = home.join(".claude-personal");
        assert_eq!(
            keychain_service_name(Some("~/.claude-personal")),
            keychain_service_name(Some(&expanded.to_string_lossy())),
        );
        assert_eq!(
            keychain_service_name(Some("~/.claude-personal/")),
            keychain_service_name(Some("~/.claude-personal")),
        );
    }

    #[test]
    fn distinct_dirs_get_distinct_services() {
        assert_ne!(
            keychain_service_name(Some("/tmp/a")),
            keychain_service_name(Some("/tmp/b"))
        );
    }

    #[test]
    fn expands_tilde_against_home() {
        let home = Path::new("/Users/daniel");
        assert_eq!(
            expand_with_home("~/.claude-work", Some(home)),
            Some(PathBuf::from("/Users/daniel/.claude-work"))
        );
        assert_eq!(
            expand_with_home("~", Some(home)),
            Some(PathBuf::from("/Users/daniel"))
        );
        assert_eq!(
            expand_with_home(" /opt/claude/ ", Some(home)),
            Some(PathBuf::from("/opt/claude"))
        );
    }

    #[test]
    fn rejects_blank_relative_and_homeless_tilde() {
        let home = Path::new("/Users/daniel");
        assert_eq!(expand_with_home("", Some(home)), None);
        assert_eq!(expand_with_home("relative/dir", Some(home)), None);
        assert_eq!(expand_with_home("~/x", None), None);
    }

    #[test]
    fn root_stays_root() {
        assert_eq!(
            expand_with_home("/", Some(Path::new("/h"))),
            Some(PathBuf::from("/"))
        );
    }

    #[test]
    fn normalize_errors_on_relative_path() {
        assert!(normalize_config_dir("nope").is_err());
        assert_eq!(normalize_config_dir("/tmp/x/").unwrap(), "/tmp/x");
    }
}
