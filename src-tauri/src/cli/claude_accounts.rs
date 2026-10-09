//! `helmor claude-accounts` — list Claude subscription accounts, plus the
//! shared `--claude-account` flag resolution used by `session` and `send`.
//!
//! The account model and label/path resolution live in
//! `crate::claude_accounts`; this file is CLI glue only.

use anyhow::Result;
use serde::Serialize;

use crate::claude_accounts::accounts::{
    load_accounts, resolve_account_arg, same_config_dir, ClaudeAccount,
};
use crate::claude_accounts::session::last_used_config_dir;

use super::args::{ClaudeAccountsAction, Cli};
use super::output;

pub fn dispatch(action: &ClaudeAccountsAction, cli: &Cli) -> Result<()> {
    match action {
        ClaudeAccountsAction::List => list(cli),
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AccountRow {
    id: String,
    label: String,
    /// Absolute config dir; `null` for the built-in default account.
    config_dir: Option<String>,
    is_default: bool,
    /// The account new chats start on (the one last picked).
    last_used: bool,
}

fn rows(accounts: Vec<ClaudeAccount>, last_used: Option<&str>) -> Vec<AccountRow> {
    accounts
        .into_iter()
        .map(|account| AccountRow {
            last_used: same_config_dir(account.config_dir.as_deref(), last_used),
            is_default: account.config_dir.is_none(),
            id: account.id,
            label: account.label,
            config_dir: account.config_dir,
        })
        .collect()
}

fn human(rows: &[AccountRow]) -> String {
    rows.iter()
        .map(|row| {
            let dir = row.config_dir.as_deref().unwrap_or("default");
            let marker = if row.last_used { "\tlast used" } else { "" };
            format!("{}\t{}{}", row.label, dir, marker)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn list(cli: &Cli) -> Result<()> {
    let rows = rows(load_accounts()?, last_used_config_dir().as_deref());
    output::print(cli, &rows, |rows| human(rows))
}

/// Resolve a `--claude-account` value against the configured accounts.
/// `None` = flag not given; `Some(None)` = the default account;
/// `Some(Some(dir))` = that config dir. Errors on an unknown label.
pub(super) fn resolve_flag(raw: Option<&str>) -> Result<Option<Option<String>>> {
    match raw {
        Some(raw) => Ok(Some(resolve_account_arg(&load_accounts()?, raw)?)),
        None => Ok(None),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::claude_accounts::accounts::build_accounts;

    fn accounts() -> Vec<ClaudeAccount> {
        build_accounts(
            None,
            Some(r#"[{"id":"p","label":"Personal","configDir":"/Users/me/.claude-personal"}]"#),
        )
    }

    #[test]
    fn default_account_is_last_used_when_nothing_was_picked() {
        let rows = rows(accounts(), None);
        assert_eq!(rows.len(), 2);
        assert!(rows[0].is_default && rows[0].last_used);
        assert!(!rows[1].is_default && !rows[1].last_used);
        assert_eq!(
            human(&rows),
            "Work\tdefault\tlast used\nPersonal\t/Users/me/.claude-personal"
        );
    }

    #[test]
    fn marks_the_picked_account_as_last_used() {
        let rows = rows(accounts(), Some("/Users/me/.claude-personal/"));
        assert!(!rows[0].last_used);
        assert!(rows[1].last_used);
        assert_eq!(
            serde_json::to_value(&rows[1]).unwrap(),
            serde_json::json!({
                "id": "p",
                "label": "Personal",
                "configDir": "/Users/me/.claude-personal",
                "isDefault": false,
                "lastUsed": true,
            })
        );
    }

    #[test]
    fn claude_account_flag_parses_on_new_send_and_update_settings() {
        use clap::Parser;

        use super::super::args::{Commands, SessionAction};

        let parse = |args: &[&str]| Cli::try_parse_from(args).expect("args should parse");

        match parse(&[
            "helmor",
            "send",
            "--workspace",
            "w",
            "--claude-account",
            "Personal",
            "hi",
        ])
        .command
        {
            Commands::Send(send) => assert_eq!(send.claude_account.as_deref(), Some("Personal")),
            _ => panic!("expected send"),
        }
        match parse(&[
            "helmor",
            "session",
            "new",
            "--workspace",
            "w",
            "--claude-account",
            "default",
        ])
        .command
        {
            Commands::Session {
                action: SessionAction::New { claude_account, .. },
            } => assert_eq!(claude_account.as_deref(), Some("default")),
            _ => panic!("expected session new"),
        }
        match parse(&[
            "helmor",
            "session",
            "update-settings",
            "--workspace",
            "w",
            "s1",
            "--claude-account",
            "~/.claude-x",
        ])
        .command
        {
            Commands::Session {
                action: SessionAction::UpdateSettings { claude_account, .. },
            } => assert_eq!(claude_account.as_deref(), Some("~/.claude-x")),
            _ => panic!("expected session update-settings"),
        }
        assert!(matches!(
            parse(&["helmor", "claude-accounts", "list", "--json"]).command,
            Commands::ClaudeAccounts { .. }
        ));
    }
}
