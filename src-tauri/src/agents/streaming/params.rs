//! `sendMessage` request param assembly + the `/add-dir` linked-directory
//! lookup it depends on. Pure modulo the DB read for linked directories,
//! which is isolated so tests can snapshot the full payload against a
//! seeded workspace row (see `tests/streaming_send_params.rs`).

use serde_json::Value;

/// Inputs to `build_send_message_params`. Grouped into a struct so the
/// constructor stays call-site ergonomic and we don't need to track
/// argument positions.
pub struct BuildSendMessageParamsInput<'a> {
    pub sidecar_session_id: &'a str,
    pub prompt: &'a str,
    pub cli_model: &'a str,
    pub cwd: &'a str,
    pub resume_session_id: Option<&'a str>,
    pub provider: &'a str,
    pub effort_level: Option<&'a str>,
    pub permission_mode: Option<&'a str>,
    pub fast_mode: bool,
    pub helmor_session_id: Option<&'a str>,
    pub claude_base_url: Option<&'a str>,
    pub claude_auth_token: Option<&'a str>,
    /// Vertex-type Claude provider; `Some` replaces base-url/token injection.
    pub claude_vertex: Option<&'a crate::provider::claude::ClaudeVertexConfig>,
    /// Forwarded as `claudeThinkingDisplay` to the sidecar. Expected
    /// values: `"summarized"` or `"omitted"`. Omitted from the wire
    /// payload when `None` so the sidecar falls back to its default.
    /// Only the Claude Code sidecar reads this; the Codex sidecar
    /// silently ignores the field, so we forward unconditionally rather
    /// than gating on `provider`.
    pub claude_thinking_display: Option<&'a str>,
    /// Image attachments to forward to the sidecar. Omitted from the
    /// wire payload when empty.
    pub images: &'a [String],
    /// Custom Codex provider to inject; `Some` only for `codex:<id>`.
    pub codex_provider: Option<&'a crate::agents::CodexProviderConfig>,
    /// The session's Claude account (`CLAUDE_CONFIG_DIR`); `None` = default
    /// account. Forwarded as `claudeConfigDir` only for Claude *subscription*
    /// turns — custom base-URL / Vertex models and other providers ignore it.
    pub claude_config_dir: Option<&'a str>,
    /// On-device model turn: the Claude agent is pointed at the bundled
    /// llama-server through [`local_agent_env`]. Replaces every other
    /// Claude endpoint/account injection.
    pub local: Option<LocalTurn<'a>>,
}

/// What a local-model turn needs on the wire.
#[derive(Clone, Copy)]
pub struct LocalTurn<'a> {
    pub endpoint: &'a crate::local_llm::AgentEndpoint,
    /// Isolated `CLAUDE_CONFIG_DIR` so the user's Claude login, user-level
    /// MCP servers, plugins and hooks never load into a local session.
    pub config_dir: &'a str,
    /// Settings > Local LLM > Thinking. Off disables the agent's thinking.
    pub thinking: bool,
    /// `Some(excludes)`: read the project's instruction files, skipping these
    /// paths (files above the project, e.g. the user's home-folder ones).
    /// `None`: read none (plain chat, or the setting is off).
    pub instruction_excludes: Option<&'a [String]>,
}

/// Build the `sendMessage` request params that the sidecar receives.
///
/// `additionalDirectories` and `sourceRepoPath` are omitted when absent
/// so the sidecar payload stays tight and existing snapshot fixtures
/// for untouched sessions don't churn.
pub fn build_send_message_params(input: BuildSendMessageParamsInput<'_>) -> Value {
    let additional_directories = lookup_workspace_linked_directories(input.helmor_session_id);
    let source_repo_path = lookup_workspace_repo_root_path(input.helmor_session_id);

    let mut params = serde_json::json!({
        "sessionId": input.sidecar_session_id,
        "prompt": input.prompt,
        "model": input.cli_model,
        "cwd": input.cwd,
        "resume": input.resume_session_id,
        "provider": input.provider,
        "effortLevel": input.effort_level,
        "permissionMode": input.permission_mode,
        "fastMode": input.fast_mode,
    });
    if !additional_directories.is_empty() {
        if let Some(obj) = params.as_object_mut() {
            obj.insert(
                "additionalDirectories".to_string(),
                Value::from(additional_directories),
            );
        }
    }
    if let Some(path) = source_repo_path {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("sourceRepoPath".to_string(), Value::from(path));
        }
    }
    if !input.images.is_empty() {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("images".to_string(), Value::from(input.images.to_vec()));
        }
    }
    if let Some(display) = input.claude_thinking_display {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("claudeThinkingDisplay".to_string(), Value::from(display));
        }
    }
    if let (Some(base_url), Some(auth_token)) = (input.claude_base_url, input.claude_auth_token) {
        if let Some(obj) = params.as_object_mut() {
            obj.insert(
                "claudeEnvironment".to_string(),
                serde_json::json!({
                    "ANTHROPIC_BASE_URL": base_url,
                    "ANTHROPIC_AUTH_TOKEN": auth_token,
                }),
            );
        }
    }
    if let Some(vertex) = input.claude_vertex {
        if let Some(obj) = params.as_object_mut() {
            insert_vertex_params(obj, vertex);
        }
    }
    if let Some(local) = input.local {
        if let Some(obj) = params.as_object_mut() {
            obj.insert(
                "claudeEnvironment".to_string(),
                Value::Object(local_agent_env(
                    local.endpoint,
                    std::env::var("NO_PROXY").ok().as_deref(),
                    local.thinking,
                    local.instruction_excludes.is_some(),
                )),
            );
            obj.insert(
                "claudeSettings".to_string(),
                local_agent_settings(local.instruction_excludes),
            );
            obj.insert("claudeConfigDir".to_string(), Value::from(local.config_dir));
        }
        return params;
    }
    if let Some(config_dir) = claude_account_dir_for_turn(&input) {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("claudeConfigDir".to_string(), Value::from(config_dir));
        }
    }
    if let Some(codex) = input.codex_provider {
        if let Some(obj) = params.as_object_mut() {
            obj.insert(
                "codexProvider".to_string(),
                serde_json::json!({
                    "id": codex.id,
                    "baseUrl": codex.base_url,
                    "apiKey": codex.api_key,
                    "wireApi": codex.wire_api,
                    "model": codex.wire_model,
                }),
            );
        }
    }
    params
}

/// Environment that points the Claude agent at the on-device model and keeps
/// it off the network: every model alias resolves to the local alias, all
/// non-essential Anthropic traffic is disabled, the context window matches
/// the server's `-c`, and loopback bypasses any configured proxy.
pub fn local_agent_env(
    endpoint: &crate::local_llm::AgentEndpoint,
    existing_no_proxy: Option<&str>,
    thinking: bool,
    read_instructions: bool,
) -> serde_json::Map<String, Value> {
    let model = crate::local_llm::API_MODEL;
    let window = endpoint.context_tokens.to_string();
    // Leave room for the conversation; a 32K window gets 8K of output.
    let max_output = (endpoint.context_tokens / 4)
        .clamp(4_096, 16_384)
        .to_string();
    let no_proxy = merge_no_proxy(existing_no_proxy);
    let mut env = serde_json::Map::new();
    // Prompt-size switches: a local model reads the whole prompt on the first
    // turn (~220 tokens/s on a laptop), so auto-memory, skills, cron,
    // workflows, background tasks and subagent listings are off. Measured:
    // first-turn prompt 19,142 -> 2,645 tokens (no instruction files).
    let optional_off = [
        (!read_instructions).then_some("CLAUDE_CODE_DISABLE_CLAUDE_MDS"),
        (!thinking).then_some("CLAUDE_CODE_DISABLE_THINKING"),
    ];
    for key in LOCAL_AGENT_DISABLED_FEATURES
        .iter()
        .copied()
        .chain(optional_off.into_iter().flatten())
    {
        env.insert(key.to_string(), Value::from("1"));
    }
    let pairs: [(&str, &str); 19] = [
        ("ANTHROPIC_BASE_URL", &endpoint.url),
        ("ANTHROPIC_AUTH_TOKEN", &endpoint.token),
        // Blank any inherited API key so only the local token is sent.
        ("ANTHROPIC_API_KEY", ""),
        ("ANTHROPIC_MODEL", model),
        ("ANTHROPIC_SMALL_FAST_MODEL", model),
        ("ANTHROPIC_DEFAULT_HAIKU_MODEL", model),
        ("ANTHROPIC_DEFAULT_SONNET_MODEL", model),
        ("ANTHROPIC_DEFAULT_OPUS_MODEL", model),
        ("ANTHROPIC_DEFAULT_FABLE_MODEL", model),
        ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"),
        ("DISABLE_TELEMETRY", "1"),
        ("DISABLE_ERROR_REPORTING", "1"),
        ("DISABLE_AUTOUPDATER", "1"),
        ("CLAUDE_CODE_MAX_CONTEXT_TOKENS", &window),
        ("CLAUDE_CODE_AUTO_COMPACT_WINDOW", &window),
        ("CLAUDE_CODE_MAX_OUTPUT_TOKENS", &max_output),
        ("NO_PROXY", &no_proxy),
        ("no_proxy", &no_proxy),
        ("MCP_CONNECTION_NONBLOCKING", "0"),
    ];
    for (key, value) in pairs {
        env.insert(key.to_string(), Value::from(value));
    }
    env
}

/// Agent features switched off for local turns (each is `<NAME>=1`).
const LOCAL_AGENT_DISABLED_FEATURES: &[&str] = &[
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
    "CLAUDE_CODE_DISABLE_BUNDLED_SKILLS",
    "CLAUDE_CODE_DISABLE_CRON",
    "CLAUDE_CODE_DISABLE_WORKFLOWS",
    "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS",
    "CLAUDE_CODE_DISABLE_ADVISOR_TOOL",
    "CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS",
];

/// Tools removed from local turns. Denied tools are dropped from the model's
/// tool list entirely, which is most of the prompt: what's left is Bash,
/// Read, Edit, Write and ExitPlanMode (plan mode). Web tools also reach
/// Anthropic-hosted services, so they must never run locally.
const LOCAL_AGENT_DENIED_TOOLS: &[&str] = &[
    "WebSearch",
    "WebFetch",
    "Agent",
    "AskUserQuestion",
    "CronCreate",
    "CronDelete",
    "CronList",
    "EnterPlanMode",
    "EnterWorktree",
    "ExitWorktree",
    "ListAgents",
    "NotebookEdit",
    "ReportFindings",
    "ScheduleWakeup",
    "SendMessage",
    "Skill",
    "TaskStop",
    "Workflow",
];

/// Inline `--settings` for local turns: trimmed tool set (see
/// [`LOCAL_AGENT_DENIED_TOOLS`]), project MCP servers never auto-enabled,
/// and instruction files outside the project skipped.
fn local_agent_settings(instruction_excludes: Option<&[String]>) -> Value {
    let mut settings = serde_json::json!({
        "permissions": { "deny": LOCAL_AGENT_DENIED_TOOLS },
        "enableAllProjectMcpServers": false,
    });
    if let Some(excludes) = instruction_excludes.filter(|e| !e.is_empty()) {
        settings["claudeMdExcludes"] = Value::from(excludes.to_vec());
    }
    settings
}

fn merge_no_proxy(existing: Option<&str>) -> String {
    let mut hosts: Vec<String> = existing
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .map(str::to_string)
        .collect();
    for host in ["127.0.0.1", "localhost"] {
        if !hosts.iter().any(|h| h == host) {
            hosts.push(host.to_string());
        }
    }
    hosts.join(",")
}

/// The Claude account applies only to a plain Claude subscription turn:
/// provider `claude`, no custom base URL / auth token, no Vertex gateway.
fn claude_account_dir_for_turn<'a>(input: &BuildSendMessageParamsInput<'a>) -> Option<&'a str> {
    let is_subscription_turn = input.provider == "claude"
        && input.local.is_none()
        && input.claude_base_url.is_none()
        && input.claude_auth_token.is_none()
        && input.claude_vertex.is_none();
    if !is_subscription_turn {
        return None;
    }
    input
        .claude_config_dir
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
}

/// Vertex-type providers: the gateway holds the GCP credentials
/// (`CLAUDE_CODE_SKIP_VERTEX_AUTH`); Claude Code authenticates to the
/// gateway itself via `ANTHROPIC_AUTH_TOKEN` (token mode) or an
/// `apiKeyHelper` reading the macOS Keychain (keychain mode). The helper
/// goes out as `claudeSettings` — the sidecar forwards it to the CLI as an
/// inline `--settings` JSON — because `apiKeyHelper` is a settings key,
/// not an env var. Token mode must NOT also set an apiKeyHelper (env token
/// outranks the helper in the CLI's credential precedence).
fn insert_vertex_params(
    obj: &mut serde_json::Map<String, Value>,
    vertex: &crate::provider::claude::ClaudeVertexConfig,
) {
    use crate::provider::claude::ClaudeVertexAuth;

    let mut env = serde_json::Map::new();
    let mut set = |k: &str, v: &str| {
        env.insert(k.to_string(), Value::from(v));
    };
    set("CLAUDE_CODE_USE_VERTEX", "1");
    set("CLAUDE_CODE_SKIP_VERTEX_AUTH", "1");
    set("ANTHROPIC_VERTEX_BASE_URL", &vertex.base_url);
    if !vertex.project_id.is_empty() {
        set("ANTHROPIC_VERTEX_PROJECT_ID", &vertex.project_id);
    }
    set(
        "CLOUD_ML_REGION",
        if vertex.region.is_empty() {
            "global"
        } else {
            &vertex.region
        },
    );
    match &vertex.auth {
        ClaudeVertexAuth::Token(token) => set("ANTHROPIC_AUTH_TOKEN", token),
        ClaudeVertexAuth::Keychain { service, account } => {
            // Quoted for the system shell — the CLI runs apiKeyHelper via `sh`.
            obj.insert(
                "claudeSettings".to_string(),
                serde_json::json!({
                    "apiKeyHelper": format!(
                        "security find-generic-password -s {} -a {} -w",
                        crate::platform::shell::quote_posix_arg(service),
                        crate::platform::shell::quote_posix_arg(account),
                    ),
                }),
            );
        }
    }
    obj.insert("claudeEnvironment".to_string(), Value::Object(env));
}

/// Load the workspace's `/add-dir` list via the helmor session id. Returns
/// an empty vec if the session is not yet persisted or the workspace has
/// no linked directories — both are normal states. DB read failures are
/// degraded to an empty list (the feature is best-effort per turn) but
/// logged so a broken DB surfaces in the logs instead of as "my
/// /add-dir silently stopped working".
pub fn lookup_workspace_linked_directories(helmor_session_id: Option<&str>) -> Vec<String> {
    let Some(hsid) = helmor_session_id else {
        return Vec::new();
    };
    let conn = match crate::models::db::read_conn() {
        Ok(c) => c,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "Failed to open DB for linked-directory lookup; falling back to empty list",
            );
            return Vec::new();
        }
    };
    let raw: Option<String> = match conn.query_row(
        r#"SELECT w.linked_directory_paths
           FROM sessions s
           JOIN workspaces w ON w.id = s.workspace_id
           WHERE s.id = ?1"#,
        [hsid],
        |row| row.get(0),
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "linked_directory_paths query failed; falling back to empty list",
            );
            return Vec::new();
        }
    };
    crate::workspaces::parse_linked_directory_paths(raw.as_deref())
}

/// Resolve the source repo root path for a helmor session. Sidecar uses
/// it to read project-scope MCP servers from `~/.claude.json` (the
/// worktree cwd never matches the user's registered project key, so
/// without this hint Claude sees only user-scope MCPs).
pub fn lookup_workspace_repo_root_path(helmor_session_id: Option<&str>) -> Option<String> {
    let hsid = helmor_session_id?;
    let conn = match crate::models::db::read_conn() {
        Ok(c) => c,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "Failed to open DB for repo root_path lookup; falling back to None",
            );
            return None;
        }
    };
    match conn.query_row(
        r#"SELECT r.root_path
           FROM sessions s
           JOIN workspaces w ON w.id = s.workspace_id
           JOIN repos r ON r.id = w.repository_id
           WHERE s.id = ?1"#,
        [hsid],
        |row| row.get::<_, Option<String>>(0),
    ) {
        Ok(Some(path)) if !path.is_empty() => Some(path),
        Ok(_) => None,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(err) => {
            tracing::warn!(
                helmor_session_id = %hsid,
                error = %err,
                "repo root_path query failed; falling back to None",
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_test_db<F: FnOnce(&rusqlite::Connection)>(name: &str, f: F) {
        let dir = tempfile::tempdir().unwrap();
        let _guard = crate::data_dir::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::env::set_var("HELMOR_DATA_DIR", dir.path());
        crate::data_dir::ensure_directory_structure().unwrap();

        let db_path = crate::data_dir::db_path().unwrap();
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO repos (id, name, default_branch) VALUES ('r-1', ?1, 'main')",
            [name],
        )
        .unwrap();
        f(&conn);
        std::env::remove_var("HELMOR_DATA_DIR");
    }

    fn insert_ws_session(
        conn: &rusqlite::Connection,
        ws_id: &str,
        sess_id: &str,
        linked: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO workspaces (id, repository_id, directory_name, state,
             status, linked_directory_paths, display_order) VALUES (?1, 'r-1', 'ws', 'ready',
             'in-progress', ?2, ?3)",
            rusqlite::params![ws_id, linked, crate::workspace::sidebar_order::ORDER_STEP],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions (id, workspace_id, status) VALUES (?1, ?2, 'idle')",
            [sess_id, ws_id],
        )
        .unwrap();
    }

    #[test]
    fn returns_empty_when_session_id_is_missing() {
        with_test_db("noop", |_conn| {
            assert!(lookup_workspace_linked_directories(None).is_empty());
        });
    }

    #[test]
    fn returns_empty_when_session_row_not_found() {
        with_test_db("orphan", |_conn| {
            assert!(lookup_workspace_linked_directories(Some("unknown-session")).is_empty());
        });
    }

    #[test]
    fn returns_empty_when_linked_column_is_null() {
        with_test_db("null-col", |conn| {
            insert_ws_session(conn, "w-1", "s-1", None);
            assert!(lookup_workspace_linked_directories(Some("s-1")).is_empty());
        });
    }

    #[test]
    fn returns_parsed_list_when_linked_column_populated() {
        with_test_db("populated", |conn| {
            insert_ws_session(conn, "w-2", "s-2", Some(r#"["/abs/a","/abs/b"]"#));
            assert_eq!(
                lookup_workspace_linked_directories(Some("s-2")),
                vec!["/abs/a".to_string(), "/abs/b".to_string()],
            );
        });
    }

    #[test]
    fn returns_empty_when_json_is_malformed() {
        with_test_db("malformed", |conn| {
            insert_ws_session(conn, "w-3", "s-3", Some("not json"));
            assert!(lookup_workspace_linked_directories(Some("s-3")).is_empty());
        });
    }

    #[test]
    fn trims_and_dedupes_at_parse_time() {
        with_test_db("normalize", |conn| {
            insert_ws_session(
                conn,
                "w-4",
                "s-4",
                Some(r#"["  /abs/a  ","/abs/a","","/abs/b"]"#),
            );
            assert_eq!(
                lookup_workspace_linked_directories(Some("s-4")),
                vec!["/abs/a".to_string(), "/abs/b".to_string()],
            );
        });
    }
}
