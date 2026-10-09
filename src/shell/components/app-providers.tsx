import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import {
	type ComponentType,
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { QuitConfirmDialog } from "@/components/quit-confirm-dialog";
import { SplashScreen } from "@/components/splash-screen";
import type { SettingsSection } from "@/features/settings";
import {
	loadSettingsModule,
	preloadSettings,
} from "@/features/settings/preload";
import { preloadFileIconsWhenIdle } from "@/lib/file-icons";
import { I18nText } from "@/lib/i18n";
import { helmorQueryPersister, QUERY_CACHE_BUSTER } from "@/lib/query-client";
import { SettingsContext } from "@/lib/settings";
import { isQuickPanelWindow } from "@/lib/window-role";
import { router } from "@/router";
import { EMPTY_SESSION_RUN_STATES } from "@/shell/constants";
import type { AppBootstrap } from "@/shell/hooks/use-app-bootstrap";

// Settings + onboarding are big and rarely needed at startup: split them out.
const SettingsDialog = lazy(() =>
	loadSettingsModule().then((m) => ({ default: m.SettingsDialog })),
);
const AppOnboarding = lazy(() =>
	import("@/features/onboarding").then((m) => ({ default: m.AppOnboarding })),
);

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
	// Mount the dialog only once it has been opened (and keep it mounted
	// afterwards so close animations / state survive). Warm the chunk when
	// the app goes idle so the first open is instant.
	const [settingsMounted, setSettingsMounted] = useState(false);
	if (settingsOpen && !settingsMounted) setSettingsMounted(true);
	useEffect(() => {
		preloadFileIconsWhenIdle();
	}, []);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const idle = window.requestIdleCallback;
		if (idle) {
			const handle = idle(() => preloadSettings(), { timeout: 5000 });
			return () => window.cancelIdleCallback?.(handle);
		}
		const timer = window.setTimeout(preloadSettings, 2000);
		return () => window.clearTimeout(timer);
	}, []);
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
							<Suspense fallback={null}>
								<AppOnboarding onComplete={completeOnboarding} />
							</Suspense>
							<QuitConfirmDialog sessionRunStates={EMPTY_SESSION_RUN_STATES} />
						</>
					)
				) : (
					<RouterProvider router={router} context={routerContext} />
				)}
				{splashMounted && !isQuickPanelWindow && (
					<SplashScreen visible={splashVisible} />
				)}
				{settingsMounted ? (
					<Suspense fallback={null}>
						<SettingsDialog
							open={settingsOpen}
							workspaceId={settingsWorkspaceId}
							workspaceRepoId={settingsWorkspaceRepoId}
							initialSection={settingsInitialSection}
							onClose={() => {
								setSettingsOpen(false);
								void queryClient.invalidateQueries({
									queryKey: ["repoScripts"],
								});
							}}
						/>
					</Suspense>
				) : null}
			</PersistQueryClientProvider>
		</SettingsContext.Provider>
	);
}
