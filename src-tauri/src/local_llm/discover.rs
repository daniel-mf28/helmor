//! Finds every GGUF the user already has on disk (Helmor's own models folder
//! and LM Studio's), so each one can appear in the model picker without being
//! added by hand.

use std::path::{Path, PathBuf};

/// Picker ids for a specific on-disk model: `helmor-local:<absolute path>`.
pub const PATH_ID_PREFIX: &str = "helmor-local:";
const MAX_DEPTH: usize = 4;

/// The on-disk path a picker id points at, if it names one.
pub fn path_from_model_id(model_id: &str) -> Option<&str> {
    model_id
        .strip_prefix(PATH_ID_PREFIX)
        .filter(|path| !path.trim().is_empty())
}

pub fn model_id_for_path(path: &Path) -> String {
    format!("{PATH_ID_PREFIX}{}", path.display())
}

/// Every chat-capable GGUF under the known model folders, sorted by path.
pub fn discover_models() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = crate::data_dir::local_llm_models_dir() {
        roots.push(dir);
    }
    if let Some(home) = crate::platform::paths::home_dir() {
        roots.push(home.join(".lmstudio").join("models"));
    }
    let mut found = Vec::new();
    for root in roots {
        collect(&root, 0, &mut found);
    }
    found.sort();
    found.dedup();
    found
}

fn collect(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth < MAX_DEPTH {
                collect(&path, depth + 1, out);
            }
        } else if is_chat_model_file(&path) {
            out.push(path);
        }
    }
}

/// A `.gguf` that is a loadable model: not a vision projector, and for
/// multi-part models only the first shard (llama-server loads the rest).
fn is_chat_model_file(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    let lower = name.to_lowercase();
    if !lower.ends_with(".gguf") || lower.contains("mmproj") {
        return false;
    }
    match lower.find("-of-") {
        Some(at) => lower[..at].ends_with("-00001"),
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_projectors_and_later_shards() {
        assert!(is_chat_model_file(Path::new("/m/Nex-Q3_K_M.gguf")));
        assert!(!is_chat_model_file(Path::new("/m/mmproj-Nex-f16.gguf")));
        assert!(is_chat_model_file(Path::new("/m/Big-00001-of-00003.gguf")));
        assert!(!is_chat_model_file(Path::new("/m/Big-00002-of-00003.gguf")));
        assert!(!is_chat_model_file(Path::new("/m/readme.txt")));
    }

    #[test]
    fn id_round_trips_path() {
        let id = model_id_for_path(Path::new("/m/a b.gguf"));
        assert_eq!(path_from_model_id(&id), Some("/m/a b.gguf"));
        assert_eq!(path_from_model_id("helmor-local"), None);
    }
}
