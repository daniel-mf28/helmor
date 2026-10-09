import { useEffect, useRef } from "react";
import type { AppSurface } from "@/lib/settings";
import type { ShellViewMode } from "@/shell/controllers/use-selection-controller";

/**
 * AppShell startup side-effect, extracted verbatim (Phase 2 split):
 * `lastSurface` restore — after settings load, if the user's persisted
 * surface was `workspace-start`, re-open the start surface (without
 * re-persisting) unless we're already sitting on a clean start view.
 *
 * Pure side-effect carrier: it owns no state and returns nothing. The pivot
 * action `openWorkspaceStart` (selection.openStart) stays owned by its
 * controller and is threaded in.
 */
export function useShellStartupEffects({
	lastSurface,
	areSettingsLoaded,
	workspaceViewMode,
	selectedWorkspaceId,
	displayedWorkspaceId,
	openWorkspaceStart,
}: {
	lastSurface: AppSurface;
	areSettingsLoaded: boolean;
	workspaceViewMode: ShellViewMode;
	selectedWorkspaceId: string | null;
	displayedWorkspaceId: string | null;
	openWorkspaceStart: (opts?: { persist?: boolean }) => void;
}) {
	// One-shot boot restore. The persisted `lastSurface` says WHICH surface to
	// restore, but persistence is now the async single `onResolved` settings
	// writer, so `appSettings.lastSurface` lags a synchronous router navigation
	// by a tick. Re-running this on every dep change therefore bounced the user
	// back to Start the instant they navigated AWAY from it: the router-derived
	// `workspaceViewMode` flips to "conversation" synchronously while
	// `lastSurface` is still "workspace-start", so the effect re-fired
	// `openWorkspaceStart`. This is a startup decision — make it exactly once
	// (after settings load), then never again, so it is timing-independent.
	const bootStartRestoreAppliedRef = useRef(false);
	useEffect(() => {
		if (bootStartRestoreAppliedRef.current || !areSettingsLoaded) {
			return;
		}
		bootStartRestoreAppliedRef.current = true;
		if (lastSurface !== "workspace-start") {
			return;
		}
		if (
			workspaceViewMode === "start" &&
			selectedWorkspaceId === null &&
			displayedWorkspaceId === null
		) {
			return;
		}
		openWorkspaceStart({ persist: false });
	}, [
		lastSurface,
		areSettingsLoaded,
		displayedWorkspaceId,
		openWorkspaceStart,
		selectedWorkspaceId,
		workspaceViewMode,
	]);
}
