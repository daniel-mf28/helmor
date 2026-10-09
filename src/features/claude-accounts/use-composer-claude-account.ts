import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
	type AgentModelOption,
	setSessionClaudeConfigDir,
	type WorkspaceSessionSummary,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { isNewSession } from "@/lib/workspace-helpers";
import {
	buildClaudeAccounts,
	findClaudeAccount,
	isClaudeSubscriptionModel,
} from "./accounts";

type Params = {
	/** Session shown in the composer; null on the start page (no session yet). */
	session: WorkspaceSessionSummary | null;
	model: Pick<AgentModelOption, "provider" | "providerKey"> | null | undefined;
};

/** Account state for one composer: which Claude account the chat runs on,
 *  whether it can still be changed, and the matching usage-meter target. */
export function useComposerClaudeAccount({ session, model }: Params) {
	const { settings, updateSettings } = useSettings();
	const queryClient = useQueryClient();

	const accounts = useMemo(
		() =>
			buildClaudeAccounts({
				claudeAccounts: settings.claudeAccounts,
				claudeDefaultAccountLabel: settings.claudeDefaultAccountLabel,
			}),
		[settings.claudeAccounts, settings.claudeDefaultAccountLabel],
	);

	const isSubscription = isClaudeSubscriptionModel(model);
	const hasMultiple = accounts.length > 1;
	// A bound session owns its account; the start page (no session yet)
	// previews the account new chats will start on.
	const rawConfigDir = session
		? (session.claudeConfigDir ?? null)
		: settings.claudeLastConfigDir;
	const selected = findClaudeAccount(accounts, rawConfigDir);
	const locked = Boolean(session) && !isNewSession(session);

	const sessionId = session?.id ?? null;
	const workspaceId = session?.workspaceId ?? null;
	const selectAccount = useCallback(
		async (configDir: string | null) => {
			try {
				if (sessionId) {
					await setSessionClaudeConfigDir(sessionId, configDir);
					if (workspaceId) {
						await queryClient.invalidateQueries({
							queryKey: helmorQueryKeys.workspaceSessions(workspaceId),
						});
					}
				}
				// Remember as the default for new chats (also read by the backend).
				await updateSettings({ claudeLastConfigDir: configDir });
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Could not switch account",
				);
			}
		},
		[sessionId, workspaceId, queryClient, updateSettings],
	);

	return {
		accounts,
		/** Show the picker: several accounts exist and the model uses one. */
		showPicker: hasMultiple && isSubscription,
		selectedConfigDir: selected.configDir,
		locked,
		selectAccount,
		/** Config dir whose usage the meter shows (null = default account). */
		usageConfigDir: isSubscription ? selected.configDir : null,
		/** Account name to tag the meter with; only when it disambiguates. */
		usageLabel: hasMultiple && isSubscription ? selected.label : null,
	};
}
