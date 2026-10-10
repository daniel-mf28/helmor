//! Bundled `llama-server` lifecycle: spawn / health-check / stop /
//! orphan reaping. Public `Manager` is what the rest of the crate
//! holds (registered as Tauri state in `lib.rs`); everything else here
//! is private plumbing.

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::Result;
use serde_json::json;

use super::{
    context::resolve_context_for_path,
    server,
    settings::{load_settings, normalize_model, Endpoint, Status},
    API_MODEL, GPU_LAYERS, LOG_TAG, REASONING_MODE, WARMUP_TIMEOUT,
};

/// Loopback endpoint of a loaded local model, ready for an agent turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentEndpoint {
    pub url: String,
    pub token: String,
    /// The server's `-c` window, so the agent compacts before overflowing.
    pub context_tokens: u32,
}

/// The agent's own instructions and tools need ~20K tokens; refuse
/// windows that can't hold them plus a real conversation.
fn check_agent_context(context_tokens: u32) -> Result<()> {
    if context_tokens < super::MIN_AGENT_CONTEXT_TOKENS {
        anyhow::bail!(
            "The local model's context window is {context_tokens} tokens; coding needs at least {}. Raise it in Settings > Local LLM.",
            super::MIN_AGENT_CONTEXT_TOKENS
        );
    }
    Ok(())
}

#[derive(Default)]
pub struct Manager {
    /// Serializes `ensure_started` / `stop` so two concurrent starts
    /// can't both spawn a child. Held across the entire spawn +
    /// health-check window. `status()` must NOT take this lock — the UI
    /// polls `status` while a slow cold-load is in flight.
    start_lock: Mutex<()>,
    server: Mutex<Option<server::ServerInstance>>,
    /// Thinking mode the running server was started with; a change in
    /// Settings restarts the server on the next start/turn.
    server_thinking: Mutex<bool>,
    starting: Mutex<bool>,
    /// Arc so warmup/healthcheck threads can write back.
    last_error: Arc<Mutex<Option<String>>>,
}

impl Manager {
    pub fn status(&self) -> Status {
        let settings = load_settings();
        let runtime_path = server::resolve_llama_server_path().ok();
        let mut server = self.server.lock().unwrap_or_else(|p| p.into_inner());
        let running = if let Some(running) = server.as_mut() {
            if server::child_is_running(&mut running.child) {
                true
            } else {
                *server = None;
                false
            }
        } else {
            false
        };
        let endpoint = server
            .as_ref()
            .filter(|_| running)
            .map(|server| format!("http://127.0.0.1:{}", server.port));
        let starting = *self.starting.lock().unwrap_or_else(|p| p.into_inner());
        Status {
            enabled: settings.enabled,
            runtime_found: runtime_path.is_some(),
            runtime_path: runtime_path.map(|path| path.display().to_string()),
            starting,
            running,
            model: normalize_model(&settings.model),
            api_model: API_MODEL.to_string(),
            context_size: resolve_context_for_path(&normalize_model(&settings.model)),
            gpu_layers: GPU_LAYERS.parse().unwrap_or(99),
            reasoning_mode: REASONING_MODE.to_string(),
            endpoint,
            last_error: self
                .last_error
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone(),
        }
    }

    pub fn start(&self) -> Result<Status> {
        let settings = load_settings();
        self.ensure_started(&normalize_model(&settings.model))?;
        Ok(self.status())
    }

    pub fn stop(&self) {
        let _guard = self.start_lock.lock().unwrap_or_else(|p| p.into_inner());
        self.kill_server();
        // Clear last_error so a restart doesn't flash a stale banner.
        *self.last_error.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    /// Connection params for the running server — `None` while stopped
    /// / starting / crashed. Voice Pilot calls this to POST chat
    /// completions directly.
    pub fn endpoint(&self) -> Option<Endpoint> {
        self.with_live_server(|s| Endpoint {
            url: format!("http://127.0.0.1:{}", s.port),
            token: s.token.clone(),
            api_model: API_MODEL.to_string(),
        })
    }

    /// Start (or reuse) the server for the selected GGUF, wait (bounded,
    /// cancellable) until the weights are loaded, and return what a
    /// coding-agent turn needs. Every error is user-facing: disabled, no
    /// model, window too small, missing runtime/model, failed load,
    /// timeout. Stop while loading surfaces as [`super::StartCancelled`].
    pub fn ensure_agent_endpoint(
        &self,
        cancel: &std::sync::atomic::AtomicBool,
    ) -> Result<AgentEndpoint> {
        use std::sync::atomic::Ordering;
        let settings = load_settings();
        let model = normalize_model(&settings.model);
        if !settings.enabled {
            anyhow::bail!("Local LLM is turned off. Turn it on in Settings > Local LLM.");
        }
        if model.is_empty() {
            anyhow::bail!("No local model selected. Choose one in Settings > Local LLM.");
        }
        let context_tokens = resolve_context_for_path(&model);
        check_agent_context(context_tokens)?;
        self.ensure_started(&model)?;
        if cancel.load(Ordering::SeqCst) {
            return Err(super::StartCancelled.into());
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .build()?;
        super::ready::wait_until_ready(
            || self.probe_ready(&client),
            cancel,
            super::ready::READY_TIMEOUT,
            super::ready::READY_POLL_INTERVAL,
        )?;
        let (url, token) = self
            .current_endpoint_and_token()
            .ok_or_else(|| anyhow::anyhow!("The local model stopped while starting."))?;
        Ok(AgentEndpoint {
            url,
            token,
            context_tokens,
        })
    }

    /// llama-server answers `/health` with 503 until the weights are loaded.
    fn probe_ready(&self, client: &reqwest::blocking::Client) -> super::ready::Probe {
        use super::ready::Probe;
        let Some((url, token)) = self.current_endpoint_and_token() else {
            return Probe::Dead("process exited".to_string());
        };
        match client
            .get(format!("{url}/health"))
            .bearer_auth(&token)
            .send()
        {
            Ok(response) if response.status().is_success() => Probe::Ready,
            Ok(response) => Probe::Loading(format!("HTTP {}", response.status())),
            Err(error) => Probe::Loading(error.to_string()),
        }
    }

    /// Active model's runtime `-c` value (token count). `0` when no
    /// model is selected, so callers can branch instead of dividing by
    /// zero.
    pub fn current_context_tokens(&self) -> u32 {
        let settings = load_settings();
        let model_path = normalize_model(&settings.model);
        if model_path.is_empty() {
            return 0;
        }
        resolve_context_for_path(&model_path)
    }

    /// Internal helper for `chat.rs` — fishes out endpoint + token in a
    /// single lock window.
    pub(super) fn current_endpoint_and_token(&self) -> Option<(String, String)> {
        self.with_live_server(|s| (format!("http://127.0.0.1:{}", s.port), s.token.clone()))
    }

    /// Lock the server slot, reap it if the child has died, then run `f`
    /// on the live instance. Centralizes the "crashed → None" invariant
    /// so every reader sees the same view as `status()` (which already
    /// inlines this same check).
    fn with_live_server<R>(&self, f: impl FnOnce(&server::ServerInstance) -> R) -> Option<R> {
        let mut server = self.server.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(running) = server.as_mut() {
            if server::child_is_running(&mut running.child) {
                return Some(f(running));
            }
            *server = None;
        }
        None
    }

    /// Drop the current server, letting `ServerInstance::drop` kill the
    /// child and remove the pid file. Caller is responsible for
    /// serializing — `stop()` holds `start_lock`.
    fn kill_server(&self) {
        let mut server = self.server.lock().unwrap_or_else(|p| p.into_inner());
        let _ = server.take();
    }

    fn ensure_started(&self, model: &str) -> Result<()> {
        let _start_guard = self.start_lock.lock().unwrap_or_else(|p| p.into_inner());
        let thinking = load_settings().thinking;
        {
            let mut server = self.server.lock().unwrap_or_else(|p| p.into_inner());
            let same_thinking = *self
                .server_thinking
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                == thinking;
            if let Some(running) = server.as_mut() {
                if running.model_path == model
                    && same_thinking
                    && server::child_is_running(&mut running.child)
                {
                    return Ok(());
                }
                // Stale (different model, thinking mode, or dead) — drop reaps it.
                let _ = server.take();
            }
        }

        let _starting = StartingFlag::new(&self.starting);
        *self
            .server_thinking
            .lock()
            .unwrap_or_else(|p| p.into_inner()) = thinking;
        let instance = spawn_llm_server(model, thinking).inspect_err(|error| {
            *self.last_error.lock().unwrap_or_else(|p| p.into_inner()) = Some(format!("{error:#}"));
        })?;
        let endpoint = format!("http://127.0.0.1:{}", instance.port);
        let token = instance.token.clone();
        *self.server.lock().unwrap_or_else(|p| p.into_inner()) = Some(instance);
        *self.last_error.lock().unwrap_or_else(|p| p.into_inner()) = None;
        // Fire-and-forget warmup (cold load ~5–10s). Failures write to `last_error`
        // so the UI doesn't show a green pill on a wedged server.
        spawn_warmup(
            endpoint.clone(),
            token.clone(),
            Arc::clone(&self.last_error),
        );
        // Continuous healthcheck — catches post-warmup hangs.
        spawn_healthcheck(endpoint, token, Arc::clone(&self.last_error));
        Ok(())
    }
}

impl Drop for Manager {
    fn drop(&mut self) {
        // App is exiting — no concurrent starts. ServerInstance::drop
        // kills the child + removes the pid file.
        self.kill_server();
    }
}

struct StartingFlag<'a> {
    starting: &'a Mutex<bool>,
}

impl<'a> StartingFlag<'a> {
    fn new(starting: &'a Mutex<bool>) -> Self {
        *starting.lock().unwrap_or_else(|p| p.into_inner()) = true;
        Self { starting }
    }
}

impl Drop for StartingFlag<'_> {
    fn drop(&mut self) {
        *self.starting.lock().unwrap_or_else(|p| p.into_inner()) = false;
    }
}

/// Reap an orphan llama-server left by a prior Helmor process.
pub fn sweep_orphan_server() {
    let Ok(data_dir) = crate::data_dir::data_dir() else {
        return;
    };
    server::sweep_orphan_pid(&data_dir.join("local-llm").join("server.pid"), LOG_TAG);
}

fn spawn_warmup(endpoint: String, token: String, last_error: Arc<Mutex<Option<String>>>) {
    std::thread::Builder::new()
        .name("local-llm-warmup".to_string())
        .spawn(move || {
            let started = Instant::now();
            let client = match reqwest::blocking::Client::builder()
                .timeout(WARMUP_TIMEOUT)
                .build()
            {
                Ok(c) => c,
                Err(error) => {
                    let msg = format!("Local LLM warmup client build failed: {error}");
                    tracing::warn!(error = %error, "Local LLM warmup: build client failed");
                    *last_error.lock().unwrap_or_else(|p| p.into_inner()) = Some(msg);
                    return;
                }
            };
            match client
                .post(format!("{endpoint}/v1/chat/completions"))
                .bearer_auth(token)
                .json(&json!({
                    "model": API_MODEL,
                    "messages": [
                        { "role": "user", "content": "ping" }
                    ],
                    "temperature": 0.0,
                    "max_tokens": 1
                }))
                .send()
            {
                Ok(response) if response.status().is_success() => {
                    tracing::info!(
                        duration_ms = started.elapsed().as_millis() as u64,
                        "Local LLM warmup completed"
                    );
                }
                Ok(response) => {
                    let status = response.status();
                    let body_preview = response
                        .text()
                        .ok()
                        .map(|b| crate::local_llm::text::truncate_middle(&b, 240))
                        .unwrap_or_default();
                    let msg = if body_preview.is_empty() {
                        format!("Local LLM warmup returned HTTP {status}")
                    } else {
                        format!("Local LLM warmup returned HTTP {status} — {body_preview}")
                    };
                    tracing::warn!(%status, body = %body_preview, "Local LLM warmup non-2xx");
                    *last_error.lock().unwrap_or_else(|p| p.into_inner()) = Some(msg);
                }
                Err(error) => {
                    let msg = format!("Local LLM warmup failed: {error}");
                    tracing::warn!(error = %error, "Local LLM warmup failed");
                    *last_error.lock().unwrap_or_else(|p| p.into_inner()) = Some(msg);
                }
            }
        })
        .ok();
}

const HEALTHCHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(15);
const HEALTHCHECK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// Poll `/v1/models` to catch process-alive-but-model-wedged. Exits on connect-refused.
fn spawn_healthcheck(endpoint: String, token: String, last_error: Arc<Mutex<Option<String>>>) {
    std::thread::Builder::new()
        .name("local-llm-healthcheck".to_string())
        .spawn(move || {
            let client = match reqwest::blocking::Client::builder()
                .timeout(HEALTHCHECK_TIMEOUT)
                .build()
            {
                Ok(c) => c,
                Err(error) => {
                    tracing::warn!(error = %error, "Local LLM healthcheck client build failed");
                    return;
                }
            };
            // Two-strikes: a single hiccup (rate-limit blip, brief GC
            // pause) shouldn't repaint the pill. Two failures in a row
            // are real.
            let mut consecutive_failures = 0u32;
            loop {
                std::thread::sleep(HEALTHCHECK_INTERVAL);
                let outcome = client
                    .get(format!("{endpoint}/v1/models"))
                    .bearer_auth(&token)
                    .send();
                match outcome {
                    Ok(response) if response.status().is_success() => {
                        if consecutive_failures > 0 {
                            tracing::info!("Local LLM healthcheck recovered");
                        }
                        consecutive_failures = 0;
                        // Don't clobber a still-relevant warmup error.
                        let mut guard = last_error.lock().unwrap_or_else(|p| p.into_inner());
                        if guard
                            .as_deref()
                            .is_some_and(|e| e.starts_with("Local LLM unresponsive"))
                        {
                            *guard = None;
                        }
                    }
                    Ok(response) => {
                        consecutive_failures += 1;
                        if consecutive_failures >= 2 {
                            let status = response.status();
                            tracing::warn!(%status, "Local LLM healthcheck non-2xx");
                            *last_error.lock().unwrap_or_else(|p| p.into_inner()) =
                                Some(format!("Local LLM unresponsive (HTTP {status})"));
                        }
                    }
                    Err(error) => {
                        consecutive_failures += 1;
                        if consecutive_failures >= 2 {
                            // Connect refused → server is gone; exit
                            // the watcher so we don't loop forever.
                            if error.is_connect() {
                                tracing::info!("Local LLM healthcheck: server gone, exiting");
                                return;
                            }
                            tracing::warn!(error = %error, "Local LLM healthcheck failed");
                            *last_error.lock().unwrap_or_else(|p| p.into_inner()) =
                                Some(format!("Local LLM unresponsive: {error}"));
                        }
                    }
                }
            }
        })
        .ok();
}

/// Build the `llama-server` arg vector for the LLM brain and spawn it
/// through the shared helper. Keeps the LLM-specific flags (alias,
/// reasoning off, log-disable) in one place.
fn spawn_llm_server(model: &str, thinking: bool) -> Result<server::ServerInstance> {
    let context_size = resolve_context_for_path(model);
    let args = llm_server_args(llama_model_args(model)?, context_size, thinking);

    let data_dir = crate::data_dir::data_dir()?.join("local-llm");
    server::spawn(server::SpawnArgs {
        model_path: model.to_string(),
        llama_args: args,
        pid_path: data_dir.join("server.pid"),
        hf_home: data_dir.join("hf"),
        logs_dir: data_dir.join("logs"),
        log_tag: LOG_TAG,
    })
}

pub(super) const NO_THINKING_TEMPLATE_KWARGS: &str =
    r#"{"reasoning_effort":"none","enable_thinking":false}"#;
const THINKING_TEMPLATE_KWARGS: &str = r#"{"reasoning_effort":"high","enable_thinking":true}"#;

/// Append the fixed LLM-brain flags to the model args.
fn llm_server_args(mut args: Vec<String>, context_size: u32, thinking: bool) -> Vec<String> {
    args.extend([
        "--alias".to_string(),
        API_MODEL.to_string(),
        "-c".to_string(),
        context_size.to_string(),
        "-ngl".to_string(),
        GPU_LAYERS.to_string(),
    ]);
    args.extend(reasoning_args(thinking));
    args.extend([
        // One slot keeps the whole window for one request; the server's
        // automatic slot count would split `-c` between requests.
        "--parallel".to_string(),
        "1".to_string(),
        // Chat-template rendering is required for tool calling.
        "--jinja".to_string(),
        "--log-disable".to_string(),
    ]);
    args
}

/// Reasoning flags. `--reasoning off` alone doesn't stop templates that
/// force-open a `<think>` block on every reply (e.g. Nex N2.5): the model
/// writes its plan into the visible answer followed by `</think>`. The
/// template kwargs are the models' own thinking switches (Nex / gpt-oss
/// style `reasoning_effort`, Qwen3 style `enable_thinking`); templates
/// ignore keys they don't use. With thinking on, `deepseek` extraction
/// returns the reasoning as separate thinking blocks, never in the answer.
fn reasoning_args(thinking: bool) -> [String; 6] {
    let (mode, kwargs) = if thinking {
        ("on", THINKING_TEMPLATE_KWARGS)
    } else {
        (REASONING_MODE, NO_THINKING_TEMPLATE_KWARGS)
    };
    [
        "--reasoning".to_string(),
        mode.to_string(),
        "--reasoning-format".to_string(),
        "deepseek".to_string(),
        "--chat-template-kwargs".to_string(),
        kwargs.to_string(),
    ]
}

/// Resolve `--model` (and `--mmproj` when a projector sits beside the weights).
fn llama_model_args(model: &str) -> Result<Vec<String>> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        anyhow::bail!("No model selected. Pick a curated model or set a custom path.");
    }
    let pb = PathBuf::from(trimmed);
    if !pb.is_file() {
        anyhow::bail!(
            "Model file not found: {trimmed}. Pick a curated model in Settings or point Custom model path at a real `.gguf` file."
        );
    }
    let mut args = vec!["--model".to_string(), trimmed.to_string()];
    if let Some(mmproj) = resolve_mmproj_for_model(&pb) {
        tracing::info!(model = trimmed, mmproj = %mmproj.display(), "vision mmproj detected");
        args.push("--mmproj".to_string());
        args.push(mmproj.to_string_lossy().into_owned());
    }
    Ok(args)
}

/// Match mmproj for `model_path`. Catalog: exact per-repo name (wrong-size
/// projectors crash llama-server). Custom: any sibling `mmproj-*.gguf`.
fn resolve_mmproj_for_model(model_path: &std::path::Path) -> Option<PathBuf> {
    let parent = model_path.parent()?;
    let file_name = model_path.file_name().and_then(|n| n.to_str())?;
    for entry in super::catalog::catalog() {
        if entry.files.iter().any(|f| f == file_name) {
            let mmproj_remote = entry.mmproj_file.as_deref()?;
            let local_name = super::asset_provider::mmproj_local_name(mmproj_remote, &entry.repo);
            let path = parent.join(local_name);
            return path.is_file().then_some(path);
        }
    }
    find_sibling_mmproj(parent)
}

/// Scan a directory for any `mmproj-*.gguf`. Preference order:
/// F16 > BF16 > F32 > anything else.
fn find_sibling_mmproj(parent: &std::path::Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(parent).ok()?;
    let mut candidates: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name().and_then(|n| n.to_str()).is_some_and(|name| {
                name.starts_with("mmproj-") && name.to_lowercase().ends_with(".gguf")
            })
        })
        .collect();
    candidates.sort_by_key(|p| {
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if name.contains("f16") && !name.contains("bf16") {
            0
        } else if name.contains("bf16") {
            1
        } else if name.contains("f32") {
            2
        } else {
            3
        }
    });
    candidates.into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_args_enable_tool_calling_and_single_slot() {
        let args = llm_server_args(vec!["--model".into(), "/m/a.gguf".into()], 65_536, false);
        let pos = |flag: &str| args.iter().position(|a| a == flag).unwrap();
        assert_eq!(args[0], "--model");
        assert!(args.iter().any(|a| a == "--jinja"));
        assert_eq!(args[pos("--alias") + 1], "helmor-local");
        assert_eq!(args[pos("-c") + 1], "65536");
        assert_eq!(args[pos("--reasoning") + 1], "off");
        assert_eq!(args[pos("--parallel") + 1], "1");
        let kwargs: serde_json::Value =
            serde_json::from_str(&args[pos("--chat-template-kwargs") + 1]).unwrap();
        assert_eq!(kwargs["reasoning_effort"], "none");
        assert_eq!(kwargs["enable_thinking"], false);
    }

    #[test]
    fn thinking_on_extracts_reasoning_separately() {
        let args = llm_server_args(vec!["--model".into(), "/m/a.gguf".into()], 65_536, true);
        let pos = |flag: &str| args.iter().position(|a| a == flag).unwrap();
        assert_eq!(args[pos("--reasoning") + 1], "on");
        assert_eq!(args[pos("--reasoning-format") + 1], "deepseek");
        let kwargs: serde_json::Value =
            serde_json::from_str(&args[pos("--chat-template-kwargs") + 1]).unwrap();
        assert_eq!(kwargs["reasoning_effort"], "high");
        assert_eq!(kwargs["enable_thinking"], true);
    }

    #[test]
    fn agent_context_floor() {
        assert!(check_agent_context(super::super::MIN_AGENT_CONTEXT_TOKENS).is_ok());
        let error = check_agent_context(16_384).unwrap_err().to_string();
        assert!(error.contains("16384"), "{error}");
        assert!(error.contains("Settings > Local LLM"), "{error}");
    }
}
