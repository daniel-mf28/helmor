# Fork playbook: adding models and reinstalling the local app

This fork (`daniel-mf28/helmor`) gets no upstream updates. New models land here by
hand, then the app is rebuilt and swapped into `/Applications` on Daniel's Mac.
This is the playbook that worked for GPT-6 Sol/Luna (#4), Opus 5.5 (#3), and
GPT-6 Astra (e9d212e3). Read it before touching the model lists or reinstalling.

## 0. Before you start

- Check `gh pr list --state open` and what the **installed** app was built from
  (`strings /Applications/Helmor.app/Contents/MacOS/helmor | grep -o -E 'gpt-6-[a-z]+|claude-opus-[0-9-]+' | sort -u`).
  If it was built from an unmerged branch, stack on that branch, or the reinstall
  silently drops models Daniel already has.
- Work on the Helmor workspace branch, base the PR on `main` (or the unmerged
  branch you stacked on).

## 1. Get the model facts from the source, not from memory

**Codex / OpenAI.** The picker list is hardcoded, but the server decides what a
given CLI version may use. Download the CLI tarballs from npm
(`@openai/codex@<ver>-darwin-arm64`), extract into `.agent-contexts/`, and run
`<extracted>/package/vendor/aarch64-apple-darwin/bin/codex debug models`. That
prints the live catalog for that client version: slug, display name, reasoning
levels, fast-mode tiers, priority (= picker order). Try the currently bundled
version and newer ones to find the **minimum version** that lists the model.
Example: GPT-6 Sol/Luna are hidden from 0.154.0, listed from 0.155.0.

**Claude.** New models ship in a Claude Code CLI release; bump
`@anthropic-ai/claude-code` and `@anthropic-ai/claude-agent-sdk` in lockstep
(see the `helmor-bump-vendors` skill).

Delete the extracted tarballs before running lint. Biome scans
`.agent-contexts/` and fails on their JSON.

## 2. Files to change

| What | File |
|---|---|
| Sidecar model catalog (id, label, cliModel, effort levels, fast mode) | `sidecar/src/model-catalog.ts` |
| Rust picker section + curated default-enabled ids | `src-tauri/src/agents/catalog.rs` (`codex_section` / claude section, `DEFAULT_*_MODEL_IDS`, and the tests at the bottom) |
| Frontend default-enabled ids | `src/lib/provider-config.ts` |
| Default-model fallback (only if the recommended default changes) | `src/shell/hooks/use-ensure-default-model.ts` |
| Tests | `sidecar/src/model-catalog.test.ts`, `sidecar/test/codex-app-server-manager.test.ts` (model count + entries), `sidecar/test/claude-session-manager.test.ts` |
| CLI version bump | `sidecar/package.json`, then `cd sidecar && bun install` |
| Tarball SHA256 for **both** arm64 and x64 | `sidecar/scripts/vendor-platform.ts` (`CODEX_SHA256` / `CLAUDE_CODE_SHA256`), with a comment on why that version is the floor |
| Changeset | `.changeset/<slug>.md` |

Order the picker the way the upstream catalog prioritises it. Keep older models
enabled unless Daniel asks otherwise.

To check the SHA256 method, hash a fresh download of the *currently pinned*
version. It must match the existing pin.

## 3. Gates (all must pass)

```bash
bun run typecheck
(cd sidecar && bun test)
bun x vitest run
(cd sidecar && bun run build)     # verifies the new SHA256; check dist/vendor/codex/codex --version
(cd src-tauri && cargo test)
bun run lint
```

## 4. Build

```bash
bun run tauri build    # ~5-10 min; output in src-tauri/target/release/bundle/macos/Helmor.app
```

Verify the bundle before installing: `strings` the binary for the new model ids,
and run `Contents/Resources/vendor/codex/codex --version`. Ad-hoc signature with
"code has no resources" from `codesign -v` is normal for these local builds.

## 5. Install: the part that went wrong before

You (the agent) run **inside** Helmor. Quitting Helmor kills your turn, so the
swap has to happen in a detached process that waits for Daniel to quit.

```bash
scripts/fork/install-local-app.sh --detach
```

Then tell Daniel, in plain words: quit Helmor with Cmd+Q, and it reopens by
itself in a few seconds. The log is at `.agent-contexts/install-local-app/install.log`.

**Never:**

- Launch the installer with `launchctl submit`. launchd keeps it alive and
  re-runs it forever. During the Opus 5.5 install it kept quitting and reopening
  Helmor and made about 20-30 backup copies of a 1.2 GB app.
- Quit or kill Helmor from the script.
- Use `grep -q` or `pgrep -f` for "is Helmor running". Under `pipefail`, `grep -q`
  makes `ps` hit SIGPIPE and the check reads as "not running". `pgrep` can't see
  the app from agent sandboxes. During the GPT-6 install this swapped the app
  2 seconds in, while Helmor was still open.
- Make timestamped backups. There is one backup,
  `~/helmor/Helmor-backup-previous.app`.

After Daniel confirms the new models show up, delete the backup:
`rm -rf ~/helmor/Helmor-backup-previous.app`.

## 6. Merge

Stacked PRs: squash-merge the bottom PR into `main`, rebase the next branch onto
`main` (drop the already-merged commit), force-push, retarget its base to `main`,
then squash-merge it. Delete merged branches.
