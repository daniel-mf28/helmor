//! Multiple Claude Code subscription accounts.
//!
//! Claude Code picks its login from the `CLAUDE_CONFIG_DIR` env var: unset
//! means `~/.claude` (the "default" account), anything else is an extra
//! account living in that directory. Helmor models an account as just its
//! config dir (`None` = default), stores the choice per session, and passes
//! it to the sidecar / usage fetcher.
//!
//! ```text
//! paths::*    <- ~ expansion, normalization, keychain service name
//! detect::*   <- find existing ~/.claude-* dirs to seed the account list
//! session::*  <- per-session account column + "last used" default
//! ```

pub mod detect;
pub mod paths;
pub mod session;

pub use paths::{
    expand_config_dir, keychain_service_name, normalize_config_dir, rate_limits_setting_key,
};
