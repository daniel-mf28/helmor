import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { type ComponentType, useCallback, useMemo } from "react";
import { QuitConfirmDialog } from "@/components/quit-confirm-dialog";
import { SplashScreen } from "@/components/splash-screen";
import { AppOnboarding } from "@/features/onboarding";
import type { SettingsSection } from "@/features/settings";
import { SettingsDialog } from "@/features/settings";
import { I18nText } from "@/lib/i18n";
import { helmorQueryPersister, QUERY_CACHE_BUSTER } from "@/lib/query-client";
import { SettingsContext } from "@/lib/settings";
import { isQuickPanelWindow } from "@/lib/window-role";
import { router } from "@/router";
import { EMPTY_SESSION_RUN_STATES } from "@/shell/constants";
import type { AppBootstrap } from "@/shell/hooks/use-app-bootstrap";

interface AppProvidersProps extends AppBootstrap {
	AppShell: ComponentType<{
		onOpenSettings: (
			workspaceId: string | null,
			workspaceRepoId: string | null,
			initialSection?: SettingsSection,
		) => void;
	}>;
}

export function AppProviders({
	appSettings,
	settingsOpen,
	settingsWorkspaceId,
	settingsWorkspaceRepoId,
	settingsInitialSection,
	settingsInitialInboxProvider,
	queryClient,
	settingsContextValue,
	splashVisible,
	splashMounted,
	completeOnboarding,
	setSettingsOpen,
	setSettingsWorkspaceId,
	setSettingsWorkspaceRepoId,
	setSettingsInitialSection,
	AppShell,
}: AppProvidersProps) {
	const onOpenSettings = useCallback(
		(
			workspaceId: string | null,
			workspaceRepoId: string | null,
			initialSection?: SettingsSection,
		) => {
			setSettingsInitialSection(initialSection);
			setSettingsWorkspaceId(workspaceId);
			setSettingsWorkspaceRepoId(workspaceRepoId);
			setSettingsOpen(true);
		},
		[
			setSettingsInitialSection,
			setSettingsWorkspaceId,
			setSettingsWorkspaceRepoId,
			setSettingsOpen,
		],
	);
	const routerContext = useMemo(
		() => ({ queryClient, onOpenSettings, appShell: AppShell }),
		[queryClient, onOpenSettings, AppShell],
	);
	return (
		<SettingsContext.Provider value={settingsContextValue}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{
					persister: helmorQueryPersister,
					buster: QUERY_CACHE_BUSTER,
				}}
			>
				{appSettings === null ? null : !appSettings.onboardingCompleted ? (
					isQuickPanelWindow ? (
						// The onboarding flow belongs to the main window; the panel
						// summoned mid-onboarding just points the user there.
						<div className="flex h-dvh items-center justify-center bg-background p-6 text-center text-ui text-muted-foreground">
							<I18nText source="finishSettingUpHelmorMainWindow" />
						</div>
					) : (
						<>
							<AppOnboarding onComplete={completeOnboarding} />
							<QuitConfirmDialog sessionRunStates={EMPTY_SESSION_RUN_STATES} />
						</>
					)
				) : (
					<RouterProvider router={router} context={routerContext} />
				)}
				{splashMounted && !isQuickPanelWindow && (
					<SplashScreen visible={splashVisible} />
				)}
				<SettingsDialog
					open={settingsOpen}
					workspaceId={settingsWorkspaceId}
					workspaceRepoId={settingsWorkspaceRepoId}
					initialSection={settingsInitialSection}
					initialInboxProvider={settingsInitialInboxProvider}
					onClose={() => {
						setSettingsOpen(false);
						void queryClient.invalidateQueries({
							queryKey: ["repoScripts"],
						});
					}}
				/>
			</PersistQueryClientProvider>
		</SettingsContext.Provider>
	);
}
