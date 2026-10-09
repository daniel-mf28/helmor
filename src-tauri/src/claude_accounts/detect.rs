//! Auto-detect existing `~/.claude-*` config dirs (e.g. the `claude-personal`
//! shell alias pointing `CLAUDE_CONFIG_DIR` at `~/.claude-personal`).

use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedClaudeAccount {
    /// Absolute config dir.
    pub config_dir: String,
    /// Suggested display name derived from the dir suffix.
    pub label: String,
}

/// Dirs directly under `home` named `.claude-<suffix>` that look like a real
/// Claude config dir (contain `.claude.json` or `settings.json`). Sorted by
/// path so results are stable.
pub fn detect_in_home(home: &Path) -> Vec<DetectedClaudeAccount> {
    let Ok(entries) = std::fs::read_dir(home) else {
        return Vec::new();
    };
    let mut found: Vec<DetectedClaudeAccount> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let suffix = name.strip_prefix(".claude-")?;
            if suffix.is_empty() {
                return None;
            }
            let path = entry.path();
            // `is_dir` follows symlinks, which is what we want.
            if !path.is_dir() {
                return None;
            }
            if !path.join(".claude.json").is_file() && !path.join("settings.json").is_file() {
                return None;
            }
            Some(DetectedClaudeAccount {
                config_dir: path.to_string_lossy().into_owned(),
                label: label_from_suffix(suffix),
            })
        })
        .collect();
    found.sort_by(|a, b| a.config_dir.cmp(&b.config_dir));
    found
}

pub fn detect() -> Vec<DetectedClaudeAccount> {
    crate::platform::paths::home_dir()
        .map(|home| detect_in_home(&home))
        .unwrap_or_default()
}

/// `personal` -> `Personal`, `team-a` -> `Team A`.
fn label_from_suffix(suffix: &str) -> String {
    suffix
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_only_dirs_with_claude_config_files() {
        let home = tempfile::tempdir().unwrap();
        let personal = home.path().join(".claude-personal");
        std::fs::create_dir(&personal).unwrap();
        std::fs::write(personal.join(".claude.json"), "{}").unwrap();

        let team = home.path().join(".claude-team-a");
        std::fs::create_dir(&team).unwrap();
        std::fs::write(team.join("settings.json"), "{}").unwrap();

        // No config files -> skipped.
        std::fs::create_dir(home.path().join(".claude-empty")).unwrap();
        // The default dir and unrelated names -> skipped.
        let default = home.path().join(".claude");
        std::fs::create_dir(&default).unwrap();
        std::fs::write(default.join("settings.json"), "{}").unwrap();
        // A file, not a dir -> skipped.
        std::fs::write(home.path().join(".claude-file"), "x").unwrap();

        let found = detect_in_home(home.path());
        let labels: Vec<_> = found.iter().map(|a| a.label.as_str()).collect();
        assert_eq!(labels, vec!["Personal", "Team A"]);
        assert_eq!(found[0].config_dir, personal.to_string_lossy());
    }

    #[test]
    fn missing_home_yields_nothing() {
        assert!(detect_in_home(Path::new("/definitely/not/here")).is_empty());
    }
}
