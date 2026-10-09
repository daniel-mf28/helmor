import { useQuery } from "@tanstack/react-query";
import { ClaudeColorIcon, OpenAIIcon } from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAgentLoginStatus, getAgentVersions } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { SettingsGroup } from "../components/settings-row";
import { CLAUDE_ADAPTER, CODEX_ADAPTER } from "./providers/adapters";
import { ProviderRow } from "./providers/provider-row";
import { ProviderConfigSection } from "./providers/provider-section";

// SettingsDialog renders outside AppShell's TooltipProvider, so wrap our own.
export function ProvidersPanel() {
	const statusQuery = useQuery({
		queryKey: helmorQueryKeys.agentLoginStatus,
		queryFn: getAgentLoginStatus,
	});
	const status = statusQuery.data;
	// CLI versions change only across app builds — cache for the session.
	const versionsQuery = useQuery({
		queryKey: helmorQueryKeys.agentVersions,
		queryFn: getAgentVersions,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const versions = versionsQuery.data;

	// First status fetch in flight → show "Connecting…" instead of a premature
	// "Log in".
	const statusLoading = statusQuery.isLoading;
	const refetchStatus = () => {
		void statusQuery.refetch();
	};

	return (
		<TooltipProvider>
			<SettingsGroup>
				<ProviderRow
					icon={ClaudeColorIcon}
					name="Claude Code"
					version={versions?.claude}
					ready={Boolean(status?.claude)}
					connecting={statusLoading}
					loginProvider="claude"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigSection adapter={CLAUDE_ADAPTER} />
				</ProviderRow>
				<ProviderRow
					icon={OpenAIIcon}
					name="Codex"
					version={versions?.codex}
					ready={Boolean(status?.codex)}
					connecting={statusLoading}
					loginProvider="codex"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigSection adapter={CODEX_ADAPTER} />
				</ProviderRow>
			</SettingsGroup>
		</TooltipProvider>
	);
}
