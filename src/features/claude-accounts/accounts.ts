import type { AgentModelOption } from "@/lib/api";
import type { ClaudeAccountSetting } from "@/lib/settings";

/** A Claude subscription login. `configDir === null` is the built-in default
 *  account (Claude Code's own `~/.claude`, no `CLAUDE_CONFIG_DIR` override). */
export type ClaudeAccount = {
	id: string;
	label: string;
	configDir: string | null;
};

export const DEFAULT_CLAUDE_ACCOUNT_ID = "default";

export function buildClaudeAccounts(settings: {
	claudeAccounts: readonly ClaudeAccountSetting[];
	claudeDefaultAccountLabel: string;
}): ClaudeAccount[] {
	return [
		{
			id: DEFAULT_CLAUDE_ACCOUNT_ID,
			label: settings.claudeDefaultAccountLabel,
			configDir: null,
		},
		...settings.claudeAccounts.map((account) => ({
			id: account.id,
			label: account.label,
			configDir: account.configDir,
		})),
	];
}

function lastPathSegment(dir: string): string {
	const parts = dir.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? dir;
}

/** Account for a stored config dir. A dir that is no longer configured (the
 *  account was removed after a chat started on it) still resolves, labelled
 *  by its folder name, so the chat keeps showing where it really runs. */
export function findClaudeAccount(
	accounts: readonly ClaudeAccount[],
	configDir: string | null | undefined,
): ClaudeAccount {
	const dir = configDir?.trim() || null;
	const found = accounts.find((account) => account.configDir === dir);
	if (found) return found;
	if (dir === null) {
		// Unreachable via buildClaudeAccounts; guards hand-built lists.
		return { id: DEFAULT_CLAUDE_ACCOUNT_ID, label: "Default", configDir: null };
	}
	return { id: dir, label: lastPathSegment(dir), configDir: dir };
}

/** The account picker (and per-account usage) only applies to the plain
 *  Claude subscription, not custom base-URL / Vertex models. */
export function isClaudeSubscriptionModel(
	model: Pick<AgentModelOption, "provider" | "providerKey"> | null | undefined,
): boolean {
	return model?.provider === "claude" && !model.providerKey;
}
