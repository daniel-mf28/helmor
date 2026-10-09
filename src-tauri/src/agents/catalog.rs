use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelOption {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub cli_model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_key: Option<String>,
    /// Always serialized (even when empty) so the frontend can
    /// distinguish "model doesn't support effort" (`[]`) from "model
    /// metadata not loaded yet" (`undefined`). The settings panel uses
    /// the empty case to disable the effort dropdown.
    #[serde(default)]
    pub effort_levels: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub supports_fast_mode: bool,
    pub supports_context_usage: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentModelSectionStatus {
    Ready,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelSection {
    pub id: String,
    pub label: String,
    pub status: AgentModelSectionStatus,
    pub options: Vec<AgentModelOption>,
}

const DEFAULT_CODEX_MODEL_IDS: &[&str] = &[
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
];
const DEFAULT_CLAUDE_MODEL_IDS: &[&str] = &[
    "claude-fable-5[1m]",
    "claude-opus-5-5[1m]",
    "claude-opus-5[1m]",
    "claude-sonnet-5-5[1m]",
    "sonnet",
    "haiku",
];

/// The composer/CLI picker catalog: full catalog with the user's model
/// selection applied. Empty sections are omitted.
pub fn static_model_sections() -> Vec<AgentModelSection> {
    let claude_enabled = load_enabled_model_ids("app.claude_enabled_model_ids");
    let codex_enabled = load_enabled_model_ids("app.codex_enabled_model_ids");
    // Each custom Codex provider gets its own `codex:<id>` section, not merged
    // into Codex; all gated by the unified `codex_enabled` list.
    let mut sections = apply_official_enabled_filter(
        model_sections_for_inputs(crate::provider::claude::configured_models(), Vec::new()),
        claude_enabled.as_deref(),
        codex_enabled.as_deref(),
    );
    let custom = codex_custom_sections(
        crate::provider::codex::load_providers(),
        codex_enabled.as_deref(),
    );
    if !custom.is_empty() {
        let at = sections
            .iter()
            .position(|section| section.id == "codex")
            .or_else(|| sections.iter().position(|section| section.id == "claude"))
            .map(|i| i + 1)
            .unwrap_or(sections.len());
        for (offset, section) in custom.into_iter().enumerate() {
            sections.insert(at + offset, section);
        }
    }
    if let Some(local) = local_model_section(&crate::local_llm::load_settings()) {
        sections.push(local);
    }
    drop_empty_sections(sections)
}

/// Model id (and wire model) of the on-device model. Matches the alias the
/// bundled llama-server advertises, so the agent's requests name it as-is.
pub const LOCAL_MODEL_ID: &str = crate::local_llm::API_MODEL;
/// Picker section id for on-device models.
pub const LOCAL_SECTION_ID: &str = "local";

/// The "On this Mac" picker section: present only while Local LLM is on and
/// a GGUF is selected. Runs on the Claude agent pointed at the local server.
fn local_model_section(settings: &crate::local_llm::Settings) -> Option<AgentModelSection> {
    let path = settings.model.trim();
    if !settings.enabled || path.is_empty() {
        return None;
    }
    let name = std::path::Path::new(path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("Local model");
    Some(AgentModelSection {
        id: LOCAL_SECTION_ID.to_string(),
        label: "On this Mac".to_string(),
        status: AgentModelSectionStatus::Ready,
        options: vec![AgentModelOption {
            id: LOCAL_MODEL_ID.to_string(),
            provider: "claude".to_string(),
            label: format!("Local · {name}"),
            cli_model: LOCAL_MODEL_ID.to_string(),
            provider_key: Some(LOCAL_SECTION_ID.to_string()),
            effort_levels: Vec::new(),
            supports_fast_mode: false,
            supports_context_usage: true,
        }],
    })
}

/// Full unfiltered catalog for the Settings "Models" multi-selects. Custom
/// Codex providers are merged into the Codex section here (unlike the composer).
pub fn full_catalog_sections() -> Vec<AgentModelSection> {
    model_sections_for_inputs(
        crate::provider::claude::configured_models(),
        codex_custom_catalog_options(crate::provider::codex::load_providers()),
    )
}

fn load_enabled_model_ids(key: &str) -> Option<Vec<String>> {
    // null/absent → None (provider default); `[]` → Some(empty) (none enabled).
    crate::settings::load_setting_json::<Vec<String>>(key)
        .ok()
        .flatten()
}

/// Apply each official family's enabled-id filter to its own section's options.
/// `claude`/`codex` track separate enabled lists; other sections pass through.
/// Sections left without models are hidden later by `drop_empty_sections`.
fn apply_official_enabled_filter(
    sections: Vec<AgentModelSection>,
    claude_enabled: Option<&[String]>,
    codex_enabled: Option<&[String]>,
) -> Vec<AgentModelSection> {
    sections
        .into_iter()
        .map(|mut section| {
            match section.id.as_str() {
                "claude" => section.options.retain(|opt| {
                    claude_enabled.map_or_else(
                        || {
                            opt.provider_key.is_some()
                                || DEFAULT_CLAUDE_MODEL_IDS.contains(&opt.id.as_str())
                        },
                        |enabled| crate::provider::is_enabled(Some(enabled), &opt.id),
                    )
                }),
                "codex" => section.options.retain(|opt| {
                    codex_enabled.map_or_else(
                        || {
                            opt.provider != "codex"
                                || DEFAULT_CODEX_MODEL_IDS.contains(&opt.id.as_str())
                        },
                        |enabled| crate::provider::is_enabled(Some(enabled), &opt.id),
                    )
                }),
                _ => {}
            }
            section
        })
        .collect()
}

/// Hide every section with no models, regardless of provider, so the composer
/// never renders an empty group.
fn drop_empty_sections(sections: Vec<AgentModelSection>) -> Vec<AgentModelSection> {
    sections
        .into_iter()
        .filter(|section| !section.options.is_empty())
        .collect()
}

/// One section per custom Codex provider, filtered by `codex_enabled` (full
/// `codex:<id>|<wire>` ids). Providers with no enabled models are omitted.
fn codex_custom_sections(
    providers: Vec<crate::provider::CustomProvider>,
    codex_enabled: Option<&[String]>,
) -> Vec<AgentModelSection> {
    let mut sections = Vec::new();
    for provider in providers {
        let instance_id = provider.id.trim();
        if instance_id.is_empty() || provider.base_url.trim().is_empty() {
            continue;
        }
        let provider_id = crate::provider::codex::provider_id(instance_id);
        let label = if provider.name.trim().is_empty() {
            format!("Codex · {instance_id}")
        } else {
            provider.name.trim().to_string()
        };
        let mut options = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for model in &provider.models {
            let wire = model.slug.trim();
            if wire.is_empty() || !seen.insert(wire.to_string()) {
                continue;
            }
            let model_id = crate::provider::codex::model_id(instance_id, wire);
            if !crate::provider::is_enabled(codex_enabled, &model_id) {
                continue;
            }
            let model_label = if model.label.trim().is_empty() {
                wire
            } else {
                model.label.trim()
            };
            options.push(codex_custom_model(
                instance_id,
                &provider_id,
                wire,
                model_label,
            ));
        }
        if options.is_empty() {
            continue;
        }
        sections.push(AgentModelSection {
            id: provider_id,
            label,
            status: AgentModelSectionStatus::Ready,
            options,
        });
    }
    sections
}

/// Flat unfiltered list of every custom Codex model, for the Settings picker.
/// Custom models merge into the Codex section here, so each label is prefixed
/// with its provider name (`Name · model`) — otherwise a custom `gpt-5.5` is
/// indistinguishable from the official one.
fn codex_custom_catalog_options(
    providers: Vec<crate::provider::CustomProvider>,
) -> Vec<AgentModelOption> {
    let mut out = Vec::new();
    for provider in providers {
        let instance_id = provider.id.trim();
        if instance_id.is_empty() || provider.base_url.trim().is_empty() {
            continue;
        }
        let provider_id = crate::provider::codex::provider_id(instance_id);
        let prefix = if provider.name.trim().is_empty() {
            instance_id
        } else {
            provider.name.trim()
        };
        let mut seen = std::collections::HashSet::new();
        for model in &provider.models {
            let wire = model.slug.trim();
            if wire.is_empty() || !seen.insert(wire.to_string()) {
                continue;
            }
            let model_label = if model.label.trim().is_empty() {
                wire
            } else {
                model.label.trim()
            };
            out.push(codex_custom_model(
                instance_id,
                &provider_id,
                wire,
                &format!("{prefix} · {model_label}"),
            ));
        }
    }
    out
}

fn codex_custom_model(
    instance_id: &str,
    provider_id: &str,
    wire_model: &str,
    label: &str,
) -> AgentModelOption {
    AgentModelOption {
        id: crate::provider::codex::model_id(instance_id, wire_model),
        provider: provider_id.to_string(),
        label: label.to_string(),
        cli_model: wire_model.to_string(),
        provider_key: None,
        effort_levels: ["low", "medium", "high", "xhigh"]
            .into_iter()
            .map(str::to_string)
            .collect(),
        // serviceTier=fast is a ChatGPT-only feature; custom endpoints ignore/reject it.
        supports_fast_mode: false,
        supports_context_usage: true,
    }
}

/// Inputs-driven helper used by tests; production goes through
/// `static_model_sections`.
fn model_sections_for_inputs(
    custom: Vec<crate::provider::claude::ClaudeProviderModel>,
    codex_custom: Vec<AgentModelOption>,
) -> Vec<AgentModelSection> {
    let mut claude_section = official_claude_section();
    claude_section
        .options
        .extend(custom_provider_options(custom));
    let mut sections = vec![claude_section];
    let mut codex = codex_section();
    codex.options.extend(codex_custom);
    sections.push(codex);

    sections
}

fn official_claude_section() -> AgentModelSection {
    AgentModelSection {
        id: "claude".to_string(),
        label: "Claude Code".to_string(),
        status: AgentModelSectionStatus::Ready,
        options: vec![
            // Fable 5 leads the Claude list as the most capable pick, but the
            // cross-provider app default is selected separately by
            // `useEnsureDefaultModel`. No fast mode (Opus 4.6+ only).
            claude_model(
                "claude-fable-5[1m]",
                "Fable 5 1M",
                &["low", "medium", "high", "xhigh", "max"],
                false,
            ),
            // Pinned to the explicit `claude-opus-5-5[1m]` wire id —
            // the `[1m]` suffix selects the 1M-context variant, matching the
            // label. We do NOT use the CLI's `default` sentinel: it resolves to
            // whatever the bundled claude-code decides (non-deterministic
            // across CLI bumps), whereas a pinned id is stable. Bump when a
            // newer Opus ships. Requires claude-code >= 2.1.280. MUST stay in
            // sync with `sidecar/src/model-catalog.ts`.
            claude_model(
                "claude-opus-5-5[1m]",
                "Opus 5.5 1M",
                &["low", "medium", "high", "xhigh", "max"],
                true,
            ),
            // Opus 5 stays on by default alongside 5.5 as the cheaper Opus
            // pick ($5/$25 vs 5.5's $4/$20 is close, but 5 remains useful for
            // sessions already pinned to it).
            claude_model(
                "claude-opus-5[1m]",
                "Opus 5 1M",
                &["low", "medium", "high", "xhigh", "max"],
                true,
            ),
            // Explicit 4.8 pin — previously this slot was the pinned newest
            // Opus; now that the Opus 5 line has it, 4.8 stays in the catalog
            // (off by default) so users can re-enable it from settings.
            claude_model(
                "claude-opus-4-8[1m]",
                "Opus 4.8 1M",
                &["low", "medium", "high", "xhigh", "max"],
                true,
            ),
            // Explicit 4.7 pin, above 4.6.
            claude_model(
                "claude-opus-4-7[1m]",
                "Opus 4.7 1M",
                &["low", "medium", "high", "xhigh", "max"],
                false,
            ),
            claude_model(
                "claude-opus-4-6[1m]",
                "Opus 4.6 1M",
                &["low", "medium", "high", "max"],
                true,
            ),
            // Pinned Sonnet 5.5 (native 1M context). All five effort levels,
            // no fast mode (Opus only). Requires claude-code >= 2.1.284. MUST
            // stay in sync with `sidecar/src/model-catalog.ts`.
            claude_model(
                "claude-sonnet-5-5[1m]",
                "Sonnet 5.5 1M",
                &["low", "medium", "high", "xhigh", "max"],
                false,
            ),
            claude_model("sonnet", "Sonnet", &["low", "medium", "high", "max"], false),
            claude_model("haiku", "Haiku", &[], false),
        ],
    }
}

fn codex_section() -> AgentModelSection {
    AgentModelSection {
        id: "codex".to_string(),
        label: "Codex".to_string(),
        status: AgentModelSectionStatus::Ready,
        options: vec![
            // GPT-6 Sol. Six reasoning levels, same set as GPT-5.6 Sol.
            codex_model(
                "gpt-6-sol",
                "GPT-6 Sol",
                &["low", "medium", "high", "xhigh", "max", "ultra"],
            ),
            // GPT-6 Astra. Five reasoning levels — `none` is explicitly
            // unsupported upstream, and there is no `ultra` tier.
            codex_model(
                "gpt-6-astra",
                "GPT-6 Astra",
                &["low", "medium", "high", "xhigh", "max"],
            ),
            // GPT-6 Luna. Five reasoning levels — no `ultra` tier.
            codex_model(
                "gpt-6-luna",
                "GPT-6 Luna",
                &["low", "medium", "high", "xhigh", "max"],
            ),
            codex_model(
                "gpt-5.6-sol",
                "GPT-5.6 Sol",
                &["low", "medium", "high", "xhigh", "max", "ultra"],
            ),
            codex_model(
                "gpt-5.6-terra",
                "GPT-5.6 Terra",
                &["low", "medium", "high", "xhigh", "max", "ultra"],
            ),
            codex_model(
                "gpt-5.6-luna",
                "GPT-5.6 Luna",
                &["low", "medium", "high", "xhigh", "max"],
            ),
            codex_model("gpt-5.5", "GPT-5.5", &["low", "medium", "high", "xhigh"]),
            codex_model("gpt-5.4", "GPT-5.4", &["low", "medium", "high", "xhigh"]),
            codex_model(
                "gpt-5.4-mini",
                "GPT-5.4 Mini",
                &["low", "medium", "high", "xhigh"],
            ),
        ],
    }
}

fn custom_provider_options(
    custom: Vec<crate::provider::claude::ClaudeProviderModel>,
) -> Vec<AgentModelOption> {
    custom
        .into_iter()
        .map(|model| AgentModelOption {
            id: model.id,
            provider: "claude".to_string(),
            label: model.label,
            cli_model: model.cli_model,
            provider_key: Some(model.provider_key),
            effort_levels: claude_effort_levels(),
            supports_fast_mode: false,
            supports_context_usage: false,
        })
        .collect()
}

fn claude_model(
    id: &str,
    label: &str,
    effort_levels: &[&str],
    supports_fast_mode: bool,
) -> AgentModelOption {
    AgentModelOption {
        id: id.to_string(),
        provider: "claude".to_string(),
        label: label.to_string(),
        cli_model: id.to_string(),
        provider_key: None,
        effort_levels: effort_levels
            .iter()
            .map(|level| level.to_string())
            .collect(),
        supports_fast_mode,
        supports_context_usage: true,
    }
}

fn codex_model(id: &str, label: &str, effort_levels: &[&str]) -> AgentModelOption {
    AgentModelOption {
        id: id.to_string(),
        provider: "codex".to_string(),
        label: label.to_string(),
        cli_model: id.to_string(),
        provider_key: None,
        effort_levels: effort_levels
            .iter()
            .map(|level| level.to_string())
            .collect(),
        supports_fast_mode: true,
        supports_context_usage: true,
    }
}

fn claude_effort_levels() -> Vec<String> {
    ["low", "medium", "high", "xhigh", "max"]
        .into_iter()
        .map(str::to_string)
        .collect()
}

/// Custom Codex provider config injected per-thread by the sidecar.
#[derive(Debug, Clone)]
pub struct CodexProviderConfig {
    /// Bare provider id used as Codex `modelProvider`.
    pub id: String,
    pub base_url: String,
    pub api_key: String,
    pub wire_api: String,
    /// Wire model name sent verbatim to the endpoint.
    pub wire_model: String,
}

/// Resolved model info needed by the streaming path.
#[derive(Debug, Clone)]
pub struct ResolvedModel {
    pub id: String,
    pub provider: String,
    pub cli_model: String,
    pub supports_effort: bool,
    pub claude_base_url: Option<String>,
    pub claude_auth_token: Option<String>,
    /// Some → Vertex-type Claude provider; replaces base-url/token injection.
    pub claude_vertex: Option<crate::provider::claude::ClaudeVertexConfig>,
    pub codex_provider: Option<CodexProviderConfig>,
    /// On-device model: the turn runs the Claude agent against the bundled
    /// llama-server and must never fall back to a cloud endpoint.
    pub local: bool,
}

impl ResolvedModel {
    /// Sidecar manager key. All Codex-family providers collapse to `"codex"`.
    pub fn sidecar_provider(&self) -> &str {
        if self.provider.starts_with("codex") {
            "codex"
        } else {
            &self.provider
        }
    }
}

/// Resolve a Helmor model id to provider + cli_model. `provider_hint`
/// is the inbound request's provider field (tie-breaker for ambiguous
/// ids); falls back to prefix inference (`gpt-` → codex, else
/// claude).
pub fn resolve_model(model_id: &str, provider_hint: Option<&str>) -> ResolvedModel {
    // Checked first and unconditionally: a local session must never resolve
    // to a cloud model, even when Local LLM is off or its model was removed.
    // The local server endpoint is attached per turn by the streaming path.
    if model_id == LOCAL_MODEL_ID {
        return ResolvedModel {
            id: LOCAL_MODEL_ID.to_string(),
            provider: "claude".to_string(),
            cli_model: LOCAL_MODEL_ID.to_string(),
            supports_effort: false,
            claude_base_url: None,
            claude_auth_token: None,
            claude_vertex: None,
            codex_provider: None,
            local: true,
        };
    }
    if let Some(model) = crate::provider::claude::resolve(model_id) {
        // Vertex providers authenticate via the vertex env block; plain
        // base-url/token injection would shadow it (ANTHROPIC_AUTH_TOKEN
        // outranks apiKeyHelper in the CLI's credential precedence).
        let is_vertex = model.vertex.is_some();
        return ResolvedModel {
            id: model.id,
            provider: "claude".to_string(),
            cli_model: model.cli_model,
            supports_effort: true,
            claude_base_url: (!is_vertex).then_some(model.base_url),
            claude_auth_token: (!is_vertex).then_some(model.api_key),
            claude_vertex: model.vertex,
            codex_provider: None,
            local: false,
        };
    }

    if let Some(model) = crate::provider::codex::resolve(model_id) {
        return ResolvedModel {
            id: model.id,
            provider: model.provider,
            cli_model: model.cli_model.clone(),
            supports_effort: true,
            claude_base_url: None,
            claude_auth_token: None,
            claude_vertex: None,
            codex_provider: Some(CodexProviderConfig {
                id: model.instance_id,
                base_url: model.base_url,
                api_key: model.api_key,
                wire_api: "responses".to_string(),
                wire_model: model.cli_model,
            }),
            local: false,
        };
    }

    let codex_prefix = crate::provider::codex::PROVIDER_PREFIX;
    let provider = match provider_hint {
        Some("codex") => "codex",
        Some("claude") => "claude",
        // `codex:<id>` reaches here only when its settings were removed.
        Some(hint) if hint.starts_with(codex_prefix) => "codex",
        _ if model_id.starts_with(codex_prefix) => "codex",
        _ if model_id.starts_with("gpt-") => "codex",
        _ => "claude",
    };

    ResolvedModel {
        id: model_id.to_string(),
        provider: provider.to_string(),
        cli_model: model_id.to_string(),
        supports_effort: true,
        claude_base_url: None,
        claude_auth_token: None,
        claude_vertex: None,
        codex_provider: None,
        local: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_model_sections_returns_hardcoded_catalog() {
        let sections = model_sections_for_inputs(Vec::new(), Vec::new());

        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].id, "claude");
        assert_eq!(sections[0].status, AgentModelSectionStatus::Ready);
        assert_eq!(
            sections[0]
                .options
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "claude-fable-5[1m]",
                "claude-opus-5-5[1m]",
                "claude-opus-5[1m]",
                "claude-opus-4-8[1m]",
                "claude-opus-4-7[1m]",
                "claude-opus-4-6[1m]",
                "claude-sonnet-5-5[1m]",
                "sonnet",
                "haiku"
            ]
        );
        assert!(sections[0]
            .options
            .iter()
            .any(|model| model.id == "claude-opus-4-6[1m]" && model.supports_fast_mode));

        assert_eq!(sections[1].id, "codex");
        assert_eq!(sections[1].status, AgentModelSectionStatus::Ready);
        assert_eq!(
            sections[1]
                .options
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "gpt-6-sol",
                "gpt-6-astra",
                "gpt-6-luna",
                "gpt-5.6-sol",
                "gpt-5.6-terra",
                "gpt-5.6-luna",
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
            ]
        );
        assert!(sections[1]
            .options
            .iter()
            .all(|model| model.supports_fast_mode));
        // GPT-6 Sol leads; Astra and both Lunas have no `ultra` tier.
        assert_eq!(
            sections[1].options[0].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max", "ultra"]
        );
        assert_eq!(
            sections[1].options[1].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );
        assert_eq!(
            sections[1].options[2].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );
        assert_eq!(
            sections[1].options[3].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max", "ultra"]
        );
        assert_eq!(
            sections[1].options[4].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max", "ultra"]
        );
        assert_eq!(
            sections[1].options[5].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );

        assert!(sections
            .iter()
            .all(|s| s.id != "cursor" && s.id != "opencode"));
    }

    #[test]
    fn custom_provider_models_append_to_official_claude_section() {
        let sections = model_sections_for_inputs(
            vec![crate::provider::claude::ClaudeProviderModel {
                id: "claude-custom|minimax|MiniMax-M2.7".to_string(),
                provider_key: "minimax".to_string(),
                label: "MiniMax M2.7".to_string(),
                cli_model: "MiniMax-M2.7".to_string(),
                base_url: "https://api.minimax.io/anthropic".to_string(),
                api_key: "sk-test".to_string(),
                vertex: None,
            }],
            Vec::new(),
        );

        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].id, "claude");
        assert_eq!(sections[0].label, "Claude Code");
        assert_eq!(
            sections[0]
                .options
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "claude-fable-5[1m]",
                "claude-opus-5-5[1m]",
                "claude-opus-5[1m]",
                "claude-opus-4-8[1m]",
                "claude-opus-4-7[1m]",
                "claude-opus-4-6[1m]",
                "claude-sonnet-5-5[1m]",
                "sonnet",
                "haiku",
                "claude-custom|minimax|MiniMax-M2.7",
            ]
        );
        assert_eq!(
            sections[0].options[9].provider_key.as_deref(),
            Some("minimax")
        );
        assert_eq!(
            sections[0].options[9].effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );
        assert!(!sections[0].options[9].supports_context_usage);
        assert_eq!(sections[1].id, "codex");
    }

    #[test]
    fn resolve_claude_model() {
        let _env = crate::testkit::TestEnv::new("resolve-claude-model");
        // The pinned Opus 4.8 1M id resolves to itself.
        let m = resolve_model("claude-opus-4-8[1m]", None);
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "claude-opus-4-8[1m]");
        assert_eq!(m.id, "claude-opus-4-8[1m]");
        assert!(m.supports_effort);
    }

    #[test]
    fn resolve_opus_model() {
        let _env = crate::testkit::TestEnv::new("resolve-opus-model");
        let m = resolve_model("opus", None);
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "opus");
    }

    #[test]
    fn resolve_sonnet_model() {
        let _env = crate::testkit::TestEnv::new("resolve-sonnet-model");
        let m = resolve_model("sonnet", None);
        assert_eq!(m.provider, "claude");
    }

    #[test]
    fn resolve_gpt_model_routes_to_codex() {
        let _env = crate::testkit::TestEnv::new("resolve-gpt-model-routes-to-codex");
        let m = resolve_model("gpt-4o", None);
        assert_eq!(m.provider, "codex");
        assert_eq!(m.cli_model, "gpt-4o");
    }

    #[test]
    fn resolve_gpt_5_4_routes_to_codex() {
        let _env = crate::testkit::TestEnv::new("resolve-gpt-5-4-routes-to-codex");
        let m = resolve_model("gpt-5.4", None);
        assert_eq!(m.provider, "codex");
    }

    fn codex_custom(id: &str, name: &str, models: &[&str]) -> crate::provider::CustomProvider {
        crate::provider::CustomProvider {
            id: id.to_string(),
            name: name.to_string(),
            base_url: "http://example.com/v1".to_string(),
            api_key: "sk-test".to_string(),
            models: models
                .iter()
                .map(|m| crate::provider::CustomProviderModel {
                    slug: m.to_string(),
                    label: String::new(),
                    ..Default::default()
                })
                .collect(),
            enabled_model_ids: None,
            ..Default::default()
        }
    }

    #[test]
    fn codex_custom_sections_one_per_provider() {
        let sections = codex_custom_sections(
            vec![codex_custom(
                "hundun",
                "Codex (Hundun)",
                &["gpt-5.5", "gpt-5.4"],
            )],
            None,
        );
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, "codex:hundun");
        assert_eq!(sections[0].label, "Codex (Hundun)");
        assert_eq!(sections[0].status, AgentModelSectionStatus::Ready);
        let opt = &sections[0].options[0];
        assert_eq!(opt.id, "codex:hundun|gpt-5.5");
        assert_eq!(opt.provider, "codex:hundun");
        assert_eq!(opt.cli_model, "gpt-5.5");
        assert!(!opt.supports_fast_mode);
        assert!(opt.supports_context_usage);
        assert_eq!(opt.effort_levels, vec!["low", "medium", "high", "xhigh"]);
    }

    #[test]
    fn codex_custom_section_skips_provider_without_models() {
        let sections = codex_custom_sections(vec![codex_custom("empty", "Empty", &[])], None);
        assert!(sections.is_empty());
    }

    #[test]
    fn codex_custom_section_label_falls_back_to_id() {
        let sections = codex_custom_sections(vec![codex_custom("hundun", "", &["gpt-5.5"])], None);
        assert_eq!(sections[0].label, "Codex · hundun");
    }

    #[test]
    fn codex_custom_section_respects_enabled_subset() {
        let provider = codex_custom("hundun", "Hundun", &["gpt-5.5", "gpt-5.4"]);
        let sections =
            codex_custom_sections(vec![provider], Some(&["codex:hundun|gpt-5.4".to_string()]));
        assert_eq!(sections.len(), 1);
        assert_eq!(
            sections[0]
                .options
                .iter()
                .map(|o| o.cli_model.as_str())
                .collect::<Vec<_>>(),
            vec!["gpt-5.4"]
        );
    }

    #[test]
    fn codex_custom_catalog_options_prefixes_label_with_provider_name() {
        // Merged into the Codex section, so the name prefix disambiguates a
        // custom `gpt-5.5` from the official one.
        let opts =
            codex_custom_catalog_options(vec![codex_custom("hundun", "Hundun", &["gpt-5.5"])]);
        assert_eq!(opts.len(), 1);
        assert_eq!(opts[0].label, "Hundun · gpt-5.5");
        assert_eq!(opts[0].id, "codex:hundun|gpt-5.5");
    }

    #[test]
    fn codex_custom_catalog_options_prefix_falls_back_to_id() {
        let opts = codex_custom_catalog_options(vec![codex_custom("hundun", "", &["gpt-5.5"])]);
        assert_eq!(opts[0].label, "hundun · gpt-5.5");
    }

    #[test]
    fn official_filter_keeps_enabled_subset() {
        let base = model_sections_for_inputs(Vec::new(), Vec::new());
        let filtered = apply_official_enabled_filter(base, None, Some(&["gpt-5.5".to_string()]));
        let codex = filtered.iter().find(|s| s.id == "codex").unwrap();
        assert_eq!(
            codex
                .options
                .iter()
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>(),
            vec!["gpt-5.5"]
        );
        let claude = filtered.iter().find(|s| s.id == "claude").unwrap();
        assert!(claude.options.len() > 1, "claude untouched when None");
    }

    #[test]
    fn official_filter_uses_curated_defaults_and_keeps_custom_codex_models() {
        let custom = codex_custom_model("hundun", "codex:hundun", "custom-model", "Custom");
        let base = model_sections_for_inputs(Vec::new(), vec![custom]);
        let filtered = apply_official_enabled_filter(base, None, None);
        let codex = filtered.iter().find(|s| s.id == "codex").unwrap();
        assert_eq!(
            codex
                .options
                .iter()
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "gpt-6-sol",
                "gpt-6-astra",
                "gpt-6-luna",
                "gpt-5.6-sol",
                "gpt-5.6-terra",
                "gpt-5.6-luna",
                "codex:hundun|custom-model",
            ]
        );
        let claude = filtered.iter().find(|s| s.id == "claude").unwrap();
        assert_eq!(
            claude
                .options
                .iter()
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "claude-fable-5[1m]",
                "claude-opus-5-5[1m]",
                "claude-opus-5[1m]",
                "claude-sonnet-5-5[1m]",
                "sonnet",
                "haiku",
            ]
        );
    }

    #[test]
    fn official_filter_can_reenable_hidden_opus_models() {
        let base = model_sections_for_inputs(Vec::new(), Vec::new());
        let filtered = apply_official_enabled_filter(
            base,
            // 4.8 dropped out of the default set when Opus 5 took its slot;
            // settings must still be able to bring it back.
            Some(&[
                "claude-opus-4-8[1m]".to_string(),
                "claude-opus-4-7[1m]".to_string(),
            ]),
            None,
        );
        let claude = filtered.iter().find(|s| s.id == "claude").unwrap();
        assert_eq!(
            claude
                .options
                .iter()
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>(),
            vec!["claude-opus-4-8[1m]", "claude-opus-4-7[1m]"]
        );
    }

    #[test]
    fn official_filter_empty_list_empties_options() {
        let base = model_sections_for_inputs(Vec::new(), Vec::new());
        let filtered = apply_official_enabled_filter(base, Some(&[]), None);
        // The filter only empties options; hiding the now-empty section is
        // `drop_empty_sections`' job (tested separately).
        let claude = filtered.iter().find(|s| s.id == "claude").unwrap();
        assert!(
            claude.options.is_empty(),
            "claude emptied when enabled = []"
        );
        let codex = filtered.iter().find(|s| s.id == "codex").unwrap();
        assert!(!codex.options.is_empty(), "codex untouched (None = all)");
    }

    #[test]
    fn drop_empty_sections_hides_any_section_without_models() {
        let section = |id: &str, options: Vec<AgentModelOption>| AgentModelSection {
            id: id.to_string(),
            label: id.to_string(),
            status: AgentModelSectionStatus::Ready,
            options,
        };
        let kept = drop_empty_sections(vec![
            section("alpha", vec![codex_model("m1", "M1", &[])]),
            section("beta", Vec::new()),
            section("gamma", vec![codex_model("m2", "M2", &[])]),
        ]);
        assert_eq!(
            kept.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            vec!["alpha", "gamma"],
        );
    }

    fn local_settings(enabled: bool, model: &str) -> crate::local_llm::Settings {
        serde_json::from_value(serde_json::json!({ "enabled": enabled, "model": model }))
            .expect("settings")
    }

    #[test]
    fn local_section_only_when_enabled_with_a_model() {
        assert!(local_model_section(&local_settings(false, "/m/Nex-mini.gguf")).is_none());
        assert!(local_model_section(&local_settings(true, "  ")).is_none());
        let section = local_model_section(&local_settings(true, "/m/Nex-mini.gguf")).unwrap();
        assert_eq!(section.id, "local");
        let option = &section.options[0];
        assert_eq!(option.id, "helmor-local");
        assert_eq!(option.cli_model, "helmor-local");
        assert_eq!(option.provider, "claude");
        assert_eq!(option.label, "Local · Nex-mini");
        assert!(option.effort_levels.is_empty());
    }

    #[test]
    fn local_model_always_resolves_local_never_cloud() {
        for hint in [None, Some("claude"), Some("codex")] {
            let model = resolve_model("helmor-local", hint);
            assert!(model.local, "hint {hint:?}");
            assert_eq!(model.provider, "claude");
            assert_eq!(model.cli_model, "helmor-local");
            assert!(!model.supports_effort);
            assert!(model.claude_base_url.is_none());
        }
    }

    #[test]
    fn sidecar_provider_collapses_codex_family() {
        let mk = |provider: &str| ResolvedModel {
            id: "x".into(),
            provider: provider.into(),
            cli_model: "x".into(),
            supports_effort: true,
            claude_base_url: None,
            claude_auth_token: None,
            claude_vertex: None,
            codex_provider: None,
            local: false,
        };
        assert_eq!(mk("codex").sidecar_provider(), "codex");
        assert_eq!(mk("codex:hundun").sidecar_provider(), "codex");
        assert_eq!(mk("claude").sidecar_provider(), "claude");
    }

    #[test]
    fn resolve_codex_custom_prefix_without_settings_routes_to_codex() {
        let _env = crate::testkit::TestEnv::new("resolve-codex-custom-prefix-routes");
        // No settings → resolve() misses → must still route to codex.
        let m = resolve_model("codex:ppio|ppio/pa/gpt-5.5", Some("codex:ppio"));
        assert_eq!(m.sidecar_provider(), "codex");
    }

    #[test]
    fn resolve_unknown_model_defaults_to_claude() {
        let _env = crate::testkit::TestEnv::new("resolve-unknown-model-defaults-to-claude");
        let m = resolve_model("some-future-model", None);
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "some-future-model");
    }

    #[test]
    fn official_claude_section_surfaces_fable_5_above_opus_lineage() {
        let sections = model_sections_for_inputs(Vec::new(), Vec::new());
        let claude = sections.iter().find(|s| s.id == "claude").unwrap();
        let ids: Vec<&str> = claude.options.iter().map(|o| o.id.as_str()).collect();
        // User-facing ordering: Fable 5 on top, then 5.5 (default), 5, 4.8,
        // 4.7, 4.6.
        assert_eq!(
            &ids[..6],
            &[
                "claude-fable-5[1m]",
                "claude-opus-5-5[1m]",
                "claude-opus-5[1m]",
                "claude-opus-4-8[1m]",
                "claude-opus-4-7[1m]",
                "claude-opus-4-6[1m]"
            ],
            "Fable 5 must lead, with Opus 5.5 (default) / 5 / 4.8 / 4.7 / 4.6 beneath it"
        );

        // Fable 5: most capable, leads the list, but is NOT the app default
        // (too expensive) — `useEnsureDefaultModel` pins to the Opus 5 id.
        // No fast mode (Opus 4.6+ only); full effort tiers incl. xhigh.
        let fable = &claude.options[0];
        assert_eq!(fable.label, "Fable 5 1M");
        assert_eq!(fable.cli_model, "claude-fable-5[1m]");
        assert!(!fable.supports_fast_mode);
        assert_eq!(
            fable.effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );

        // Opus 5.5: the app default selection, supports fast mode, and keeps
        // the xhigh effort tier. Pinned to its explicit `[1m]` wire id.
        let default = &claude.options[1];
        assert_eq!(default.label, "Opus 5.5 1M");
        assert_eq!(default.cli_model, "claude-opus-5-5[1m]");
        assert!(default.supports_fast_mode, "Opus 5.5 supports fast mode");
        assert_eq!(
            default.effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );

        // Opus 5: stays default-enabled beneath 5.5 as the cheaper Opus pick.
        let opus5 = &claude.options[2];
        assert_eq!(opus5.label, "Opus 5 1M");
        assert_eq!(opus5.cli_model, "claude-opus-5[1m]");
        assert!(opus5.supports_fast_mode, "Opus 5 supports fast mode");
        assert_eq!(
            opus5.effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );

        // Opus 4.8: still in the catalog so users can re-enable it from
        // settings, though it is no longer in the default-enabled set.
        let prev = &claude.options[3];
        assert_eq!(prev.label, "Opus 4.8 1M");
        assert_eq!(prev.cli_model, "claude-opus-4-8[1m]");
        assert!(prev.supports_fast_mode, "Opus 4.8 supports fast mode");

        // Explicit 4.7 pin: same effort tiers as before, still no fast mode.
        let opus47 = &claude.options[4];
        assert_eq!(opus47.label, "Opus 4.7 1M");
        assert_eq!(opus47.cli_model, "claude-opus-4-7[1m]");
        assert!(!opus47.supports_fast_mode);
        assert_eq!(
            opus47.effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );

        // 4.6 unchanged.
        let opus46 = &claude.options[5];
        assert_eq!(opus46.label, "Opus 4.6 1M");
        assert!(opus46.supports_fast_mode);

        // Sonnet 5.5: pinned 1M id, all five effort tiers, no fast mode.
        let sonnet55 = &claude.options[6];
        assert_eq!(sonnet55.label, "Sonnet 5.5 1M");
        assert_eq!(sonnet55.cli_model, "claude-sonnet-5-5[1m]");
        assert!(!sonnet55.supports_fast_mode);
        assert_eq!(
            sonnet55.effort_levels,
            vec!["low", "medium", "high", "xhigh", "max"]
        );
    }

    #[test]
    fn provider_hint_disambiguates_overlapping_ids() {
        let _env = crate::testkit::TestEnv::new("provider-hint-disambiguates-overlapping-");
        // A bare `gpt-`-prefixed id routes to Codex by prefix, but a
        // provider hint overrides prefix inference.
        let codex = resolve_model("gpt-5.3-codex", Some("codex"));
        assert_eq!(codex.provider, "codex");
        let claude = resolve_model("gpt-5.3-codex", Some("claude"));
        assert_eq!(claude.provider, "claude");

        // Removed providers (cursor/opencode) are no longer recognized as
        // hints; their ids fall through to prefix inference.
        let fallback = resolve_model("claude-sonnet-4-5", Some("cursor"));
        assert_eq!(fallback.provider, "claude");
        let slug = resolve_model("anthropic/claude-opus-4-5", Some("opencode"));
        assert_eq!(slug.provider, "claude");
    }
}
