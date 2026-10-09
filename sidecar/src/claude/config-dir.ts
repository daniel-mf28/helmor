/**
 * Claude account selection via `CLAUDE_CONFIG_DIR`.
 *
 * Claude Code picks its login from this env var (unset = `~/.claude`, the
 * default account). The host sends the session's account as an absolute
 * `claudeConfigDir`; we expand it defensively (`~`, trailing slashes) and
 * inject it into every per-query SDK `env`. Absent/blank means "default
 * account": no override at all, so behavior is unchanged.
 */

import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** `~`, `~/x` and trailing slashes -> absolute path; `undefined` for
 *  blank or still-relative input (Claude hashes an absolute path). */
export function expandClaudeConfigDir(
	dir: string | undefined | null,
): string | undefined {
	const trimmed = dir?.trim();
	if (!trimmed) return undefined;
	let expanded = trimmed;
	if (trimmed === "~") expanded = homedir();
	else if (trimmed.startsWith("~/") || trimmed.startsWith("~\\"))
		expanded = join(homedir(), trimmed.slice(2));
	if (!isAbsolute(expanded)) return undefined;
	const stripped = expanded.replace(/[\\/]+$/, "");
	return stripped === "" ? expanded : stripped;
}

/** Env override carrying the account, or `undefined` for the default one. */
export function claudeConfigDirEnv(
	dir: string | undefined | null,
): Record<string, string> | undefined {
	const expanded = expandClaudeConfigDir(dir);
	return expanded ? { CLAUDE_CONFIG_DIR: expanded } : undefined;
}
