# Per-vendor bump reference

Exact pin location, SHA256 source, gotchas, and post-bump steps for every bundled vendor.
All paths are relative to the repo root. Line numbers drift — grep the named constant/key instead.

## Contents

- [Claude (claude-agent-sdk + claude-code)](#claude) — class A+B, **lockstep**
- [Codex (@openai/codex)](#codex) — class B, layout descriptor
- [Kimi](#kimi) — class C, GitHub release, ACP protocol
- [Pi (@earendil-works/pi-*)](#pi) — class A, **dead code → prefer delete**
- [gh / glab / llama.cpp](#supporting-tools) — class C, supporting binaries

OpenCode, Cursor (`@cursor/sdk` + Node worker), and the bundled Node runtime were removed from
this fork; they have no pins left to bump.

---

## Claude

**Integration:** `@anthropic-ai/claude-agent-sdk` is imported in `sidecar/src/claude/`; the SDK
spawns the bundled `claude` binary (`@anthropic-ai/claude-code`, staged from `node_modules`).

**LOCKSTEP — bump both to the same patch X:**
- `sidecar/package.json`: `@anthropic-ai/claude-agent-sdk` = `0.3.X`, `@anthropic-ai/claude-code` = `2.1.X`.
- Verify the pairing: `node_modules/@anthropic-ai/claude-agent-sdk/package.json` has `claudeCodeVersion: "2.1.X"`.

**SHA256 (claude-code only — the agent-sdk is a plain npm dep, no SHA):**
- Table: `CLAUDE_CODE_SHA256["2.1.X"] = { arm64, x64 }` in `sidecar/scripts/vendor-platform.ts`.
- Compute: `scripts/npm_vendor_sha.sh claude-code 2.1.X` (downloads
  `registry.npmjs.org/@anthropic-ai/claude-code-darwin-{arm64,x64}/-/claude-code-darwin-{arm64,x64}-2.1.X.tgz`).

**Gotchas:**
- dist-tags: target `latest`. claude-code also has a `stable` tag that LAGS — ignore it, Helmor tracks `latest`.
- The Rust pipeline depends on the SDK stdout event shape (`SDKMessage`, stream blocks, tool_use/tool_result,
  thinking). The `cargo` pipeline gate is mandatory after every claude-code bump.

---

## Codex

**Integration:** spawns the bundled `codex app-server` binary over JSON-RPC (NOT an npm SDK — there
is no `@openai/codex-sdk` dependency despite older doc wording). Code in `sidecar/src/codex/`.

**Pins:**
- `sidecar/package.json`: `@openai/codex` = `X` (e.g. `0.142.0`).
- SHA256 table: `CODEX_SHA256["X"] = { arm64, x64 }` in `vendor-platform.ts`.
- Compute: `scripts/npm_vendor_sha.sh codex X` (downloads `registry.npmjs.org/@openai/codex/-/codex-X-darwin-{arm64,x64}.tgz`).

**Gotchas:**
- **Layout descriptor.** Codex ≥0.134 ships `node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex-package.json`
  (`layoutVersion`, `entrypoint`, `pathDir`, `resourcesDir`). `stage-vendor.ts` reads it and is
  forward-compatible for field renames. **After a bump, diff this descriptor** — if `layoutVersion`
  bumps past 1 or new top-level keys appear, review `stageCodexFromVendorRoot` in `stage-vendor.ts`.
- Rust pipeline consumes `item/`, `turn/`, `thread/` slash-form methods (see `pipeline/accumulator/codex.rs`
  `normalize_item_type`). New item types or renamed methods require Rust changes — the cargo gate catches drift.

---

## Kimi

**Integration:** the bundled `kimi` binary speaks ACP (`kimi acp`) over a hand-rolled protocol in
`sidecar/src/kimi/`. Class C — GitHub-release binary, **not** an npm dep, **not** in `package.json`.

**Pins (both in `vendor-platform.ts`):**
- `KIMI_VERSION = "X"`.
- `KIMI_SHA256["X"]` with **four** platform keys: `darwin-arm64`, `darwin-x64`, `win32-arm64`, `win32-x64`.

**Version + SHA source:** repo `MoonshotAI/kimi-code`. Release tag is the scoped npm tag, url-encoded:
`%40moonshot-ai/kimi-code%40X`. Assets: `kimi-code-<platform>.zip`. Get each SHA from the asset's
`digest` field via the GitHub API (or the `.zip.sha256` sidecar):
```bash
curl -s "https://api.github.com/repos/MoonshotAI/kimi-code/releases/tags/%40moonshot-ai%2Fkimi-code%40X" \
  | python3 -c 'import sys,json; r=json.load(sys.stdin); [print(a["name"], a.get("digest")) for a in r["assets"] if a["name"].endswith(".zip")]'
```
The `digest` is `sha256:<hex>` — pin the hex. (Verify by downloading + `shasum -a 256` if unsure; the
build hard-fails on mismatch anyway.)

**Gotchas:**
- **ACP protocol version.** Helmor hard-enforces `ACP_PROTOCOL_VERSION` (`sidecar/src/kimi/acp-types.ts`)
  at the handshake and throws on mismatch. Kimi patch releases have not changed it, but if a release
  negotiates a different version, the connection breaks — smoke-test `kimi acp`'s `initialize` response.
- Most kimi releases are TUI/web-only (no ACP changes) → often low-value bumps. Check release notes.
- A changed SHA auto-forces re-download from `.bundle-cache`; a manual `sidecar/.bundle-cache` wipe is
  belt-and-suspenders, not required.

---

## Pi

**Status: DEAD CODE.** `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` are declared in
`sidecar/package.json` but **imported nowhere** (only referenced in `src-tauri/src/agents/provider_capabilities.rs`
comments as a hypothetical future provider). They drag a heavy transitive tree (anthropic sdk, aws
bedrock, google genai, mistral, openai) into the compiled sidecar.

**Recommendation: DELETE rather than bump.** Remove both lines from `package.json`, `bun install`,
then `rm -rf sidecar/node_modules/@earendil-works` (bun may leave stale orphan dirs after removal;
confirm `grep -c earendil sidecar/bun.lock` is 0).

If a future integration revives it: `^0.75.x` (caret on a 0.x package) floats only within `0.75.x`, so
a real upgrade needs editing the range. Note 0.80.0 has a breaking API rewrite (`AgentHarnessOptions.models`
required, `getApiKeyAndHeaders` removed).

---

## Supporting tools

All class C, all in `vendor-platform.ts`, none in `package.json`. macOS SHA is strict; Windows is
soft-verified (empty `""` SHA tolerated). arch naming for gh/glab is `arm64`/`amd64`.

### gh (`GH_VERSION` + `GH_SHA256{arm64,amd64}`)
Repo `cli/cli`. SHA from `gh_<ver>_checksums.txt` at the release — pick the macOS zip rows
(`gh_<ver>_macOS_{arm64,amd64}.zip`).

### glab (`GLAB_VERSION` + `GLAB_SHA256{arm64,amd64}`)
GitLab `gitlab-org/cli`. SHA from `checksums.txt` at the release — the
`glab_<ver>_darwin_{arm64,amd64}.tar.gz` rows.

### llama.cpp (`LLAMA_VERSION` + `LLAMA_SHA256{arm64,x64}`)
Repo `ggml-org/llama.cpp`, version is a build tag (e.g. `b9763`). Asset
`llama-<ver>-bin-macos-{arm64,x64}.tar.gz`. SHA is soft-verified (the table may hold `""` for dev);
compute with `curl … | shasum -a 256` to pin for release.
