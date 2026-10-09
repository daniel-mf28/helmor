//! Foundational local-LLM infrastructure: bundled `llama-server` lifecycle,
//! GGUF model catalog, OpenAI-compatible chat client, hardware-aware
//! context budgeting. Today this powers session-title generation and the
//! Voice Pilot endpoint; future on-device features (commit drafts,
//! code-review hints, …) layer on top.

pub mod asset_provider;
pub mod catalog;
mod chat;
mod context;
pub mod gguf;
pub mod hardware;
mod manager;
mod ready;
mod server;
mod settings;
mod text;
mod title;

pub use asset_provider::CatalogAssetProvider;
pub use catalog::CatalogEntry;
pub use context::{
    compute_default_context_for_meta, custom_override_key, set_context_override, MIN_CONTEXT_TOKENS,
};
pub use hardware::HardwareSnapshot;
pub use manager::{sweep_orphan_server, AgentEndpoint, Manager};
pub use ready::StartCancelled;
pub use settings::{load_settings, set_active_model_path, Endpoint, Settings, Status};
pub use text::truncate_middle;

const SETTINGS_KEY: &str = "app.local_llm";
// Alias the bundled `llama-server` advertises to the OpenAI-compatible
// API. Frontends POST to `model: helmor-local`.
pub const API_MODEL: &str = "helmor-local";
/// Smallest context window a coding-agent turn can run in. The agent's
/// instructions plus tool definitions alone take roughly 20K tokens.
pub const MIN_AGENT_CONTEXT_TOKENS: u32 = 32_768;
const GPU_LAYERS: &str = "99";
const REASONING_MODE: &str = "off";
const LOG_TAG: &str = "local-llm";
const CHAT_MAX_TOKENS: u32 = 192;
const WARMUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
