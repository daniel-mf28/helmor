import { useQuery } from "@tanstack/react-query";
import { ClaudeColorIcon, KimiIcon, OpenAIIcon } from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAgentLoginStatus, getAgentVersions } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { SettingsGroup } from "../components/settings-row";
import {
	CLAUDE_ADAPTER,
	CODEX_ADAPTER,
	KIMI_CONFIG_ADAPTER,
} from "./providers/adapters";
import { CustomProvidersList } from "./providers/custom-providers-list";
import { KimiModels } from "./providers/kimi-models";
import { LoginGate } from "./providers/login-gate";
import { ProviderConfigRow, ProviderRow } from "./providers/provider-row";
import { ProviderConfigSection } from "./providers/provider-section";
import { useKimiModelSync } from "./providers/use-kimi-model-sync";

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
	// Kimi's isSyncing is already global (useIsMutating inside the hook), so a
	// sync from any panel spins this row too; sync after login so the models
	// panel isn't empty until a manual Sync.
	const { sync: syncKimiModels, isSyncing: kimiSyncing } = useKimiModelSync();

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
				<ProviderRow
					icon={KimiIcon}
					name="Kimi"
					version={versions?.kimi}
					ready={Boolean(status?.kimi)}
					connecting={statusLoading || kimiSyncing}
					loginProvider="kimi"
					onLoginExit={() => {
						refetchStatus();
						void syncKimiModels().catch(() => {});
					}}
					collapsible
				>
					{/* Kimi runs over ACP, which rejects every session until you sign in
					    — even custom providers. Lock the whole section until then. */}
					<LoginGate
						locked={!statusLoading && !status?.kimi}
						message="settingsSignInToKimiEvenCustom"
					>
						<ProviderConfigRow
							label="models"
							description="settingsPickWhichKimiModelsAppearComposer"
						>
							<KimiModels />
						</ProviderConfigRow>
						<ProviderConfigRow
							label="customProviders"
							description={KIMI_CONFIG_ADAPTER.customProvidersDescription}
						>
							<CustomProvidersList adapter={KIMI_CONFIG_ADAPTER} />
						</ProviderConfigRow>
					</LoginGate>
				</ProviderRow>
			</SettingsGroup>
		</TooltipProvider>
	);
}
