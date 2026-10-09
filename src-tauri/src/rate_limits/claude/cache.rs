//! Process-wide in-memory cache for Claude OAuth credentials, one entry per
//! account (keyed by the account's keychain service name). Avoids touching
//! the keychain on every fetch tick; an entry is cleared on HTTP 401 so a
//! server-side revocation can't trap us in a stale loop.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::credentials::ClaudeOAuthCredentials;

/// Refresh this many ms before the access token's real expiry to avoid
/// an in-flight request 401'ing on the boundary.
const CACHE_EXPIRY_BUFFER_MS: i64 = 60_000;

/// Maximum wall-clock age for a cached entry, regardless of `expires_at`.
/// Belt-and-suspenders for tokens with missing or very-far-future expiry.
/// Mirrors CodexBar's `memoryCacheValidityDuration = 1800`.
const CACHE_MAX_AGE: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone)]
struct CacheEntry {
    credentials: ClaudeOAuthCredentials,
    cached_at: Instant,
}

pub(super) struct CredentialsCache {
    entries: Mutex<BTreeMap<String, CacheEntry>>,
}

impl CredentialsCache {
    pub(super) const fn new() -> Self {
        Self {
            entries: Mutex::new(BTreeMap::new()),
        }
    }

    /// `now` is wall-clock ms (matched against the token's `expires_at`).
    /// Internally we also use `Instant::now()` (monotonic) for the
    /// max-age check — deliberately mixed: wall-clock catches "the
    /// token is past its server-side expiry," monotonic catches "this
    /// cache entry has been sitting around for a while" without being
    /// disturbed by system-clock changes.
    pub(super) fn get(&self, key: &str, now: i64) -> Option<ClaudeOAuthCredentials> {
        let guard = self.entries.lock().ok()?;
        let entry = guard.get(key)?;
        if entry.cached_at.elapsed() > CACHE_MAX_AGE {
            return None;
        }
        if entry.credentials.is_expired(now + CACHE_EXPIRY_BUFFER_MS) {
            return None;
        }
        if !entry.credentials.has_required_scope() {
            return None;
        }
        Some(entry.credentials.clone())
    }

    pub(super) fn store(&self, key: &str, credentials: &ClaudeOAuthCredentials) {
        if let Ok(mut guard) = self.entries.lock() {
            guard.insert(
                key.to_string(),
                CacheEntry {
                    credentials: credentials.clone(),
                    cached_at: Instant::now(),
                },
            );
        }
    }

    pub(super) fn invalidate(&self, key: &str) {
        if let Ok(mut guard) = self.entries.lock() {
            guard.remove(key);
        }
    }
}

pub(super) static CREDENTIALS_CACHE: CredentialsCache = CredentialsCache::new();

#[cfg(test)]
mod tests {
    use super::*;

    const K: &str = "Claude Code-credentials";

    fn fresh_credentials(now: i64) -> ClaudeOAuthCredentials {
        ClaudeOAuthCredentials {
            access_token: "tok".to_string(),
            expires_at: Some(now + 3_600_000),
            scopes: vec!["user:profile".to_string()],
        }
    }

    #[test]
    fn empty_cache_returns_none() {
        let cache = CredentialsCache::new();
        assert!(cache.get(K, 0).is_none());
    }

    #[test]
    fn store_then_get_returns_same_credentials() {
        let cache = CredentialsCache::new();
        let creds = fresh_credentials(1_000_000);
        cache.store(K, &creds);
        let cached = cache.get(K, 1_000_000).expect("cache hit");
        assert_eq!(cached.access_token, creds.access_token);
    }

    #[test]
    fn cache_misses_when_token_within_safety_buffer() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        // Token expires 30s from now — inside the 60s safety buffer.
        let creds = ClaudeOAuthCredentials {
            access_token: "tok".to_string(),
            expires_at: Some(now + 30_000),
            scopes: vec!["user:profile".to_string()],
        };
        cache.store(K, &creds);
        assert!(
            cache.get(K, now).is_none(),
            "should miss inside safety buffer"
        );
    }

    #[test]
    fn cache_misses_when_token_already_expired() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        let creds = ClaudeOAuthCredentials {
            access_token: "tok".to_string(),
            expires_at: Some(now - 1),
            scopes: vec!["user:profile".to_string()],
        };
        cache.store(K, &creds);
        assert!(cache.get(K, now).is_none());
    }

    #[test]
    fn cache_misses_when_scope_missing() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        let creds = ClaudeOAuthCredentials {
            access_token: "tok".to_string(),
            expires_at: Some(now + 3_600_000),
            scopes: Vec::new(),
        };
        cache.store(K, &creds);
        assert!(cache.get(K, now).is_none());
    }

    #[test]
    fn invalidate_clears_cached_entry() {
        let cache = CredentialsCache::new();
        let creds = fresh_credentials(1_000_000);
        cache.store(K, &creds);
        cache.invalidate(K);
        assert!(cache.get(K, 1_000_000).is_none());
    }

    #[test]
    fn store_overwrites_previous_entry() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        let mut creds = fresh_credentials(now);
        cache.store(K, &creds);
        creds.access_token = "tok2".to_string();
        cache.store(K, &creds);
        let cached = cache.get(K, now).expect("cache hit");
        assert_eq!(cached.access_token, "tok2");
    }

    #[test]
    fn invalidate_on_empty_cache_is_a_noop() {
        let cache = CredentialsCache::new();
        cache.invalidate(K);
        assert!(cache.get(K, 0).is_none());
    }

    #[test]
    fn cache_returns_none_when_token_expires_exactly_at_buffer_boundary() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        let creds = ClaudeOAuthCredentials {
            access_token: "tok".to_string(),
            expires_at: Some(now + CACHE_EXPIRY_BUFFER_MS),
            scopes: vec!["user:profile".to_string()],
        };
        cache.store(K, &creds);
        // is_expired is `<=`, so the boundary value counts as expired.
        assert!(cache.get(K, now).is_none());
    }

    #[test]
    fn store_then_get_concurrent_does_not_panic() {
        use std::sync::Arc;
        use std::thread;

        let cache = Arc::new(CredentialsCache::new());
        let now = 1_000_000_i64;
        cache.store(K, &fresh_credentials(now));

        let mut handles = Vec::new();
        for i in 0..8 {
            let cache = cache.clone();
            handles.push(thread::spawn(move || {
                if i % 2 == 0 {
                    let _ = cache.get(K, now);
                } else {
                    cache.store(K, &fresh_credentials(now));
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert!(cache.get(K, now).is_some());
    }

    #[test]
    fn entries_are_isolated_per_account_key() {
        let cache = CredentialsCache::new();
        let now = 1_000_000_i64;
        let mut work = fresh_credentials(now);
        work.access_token = "work".to_string();
        let mut personal = fresh_credentials(now);
        personal.access_token = "personal".to_string();
        cache.store("work", &work);
        cache.store("personal", &personal);
        assert_eq!(cache.get("work", now).unwrap().access_token, "work");
        assert_eq!(cache.get("personal", now).unwrap().access_token, "personal");
        cache.invalidate("work");
        assert!(cache.get("work", now).is_none());
        assert!(cache.get("personal", now).is_some());
    }
}
