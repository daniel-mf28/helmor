// The whole app surface. A thin component that pulls the entire orchestration
// graph from `useAppShellState` and shapes it into the grouped child-prop bags
// `AppShellLayout` consumes. The two perf-critical header memo nodes are
// computed here at the orchestration boundary (NOT inside a memoized JSX child)
// so their element identity stays stable across AppShell re-renders — see the
// P1-A note below. Lifted verbatim out of App.tsx; the bag assembly reads off
// the `useAppShellState` result (`s` + its `sel` / `data` / `chrome` / `panels`
// groups).
import { useMemo } from "react";
import type { SettingsSection } from "@/features/settings";
import { workspaceModeHasGitContext } from "@/lib/api";
import { useAppShellState } from "@/shell/hooks/use-app-shell-state";
import { AppShellLayout } from "./app-shell-layout";
import { WorkspaceHeaderActions } from "./workspace-header-actions";
import { WorkspaceHeaderLeading } from "./workspace-header-leading";
import { buildWorkspacePaneProps } from "./workspace-pane-props";

export function AppShell({
	onOpenSettings,
}: {
	onOpenSettings: (
		workspaceId: string | null,
		workspaceRepoId: string | null,
		initialSection?: SettingsSection,
	) => void;
}) {
	const s = useAppShellState({ onOpenSettings });
	const { sel, data, chrome, panels } = s;
	// Router-owned selection (Stage 3b) — same primitives `useAppShellState`
	// threads into the data/chrome layers, so the P1-A header memo deps below
	// see byte-identical values, just sourced from the router.
	const selectedWorkspaceId = s.selectedWorkspaceId;
	const inspectorCollapsed = sel.contextPanel.inspectorCollapsed;
	const setInspectorCollapsed = sel.contextPanelActions.setInspectorCollapsed;

	// P1-A: React Compiler bailed out on this ~1650-line AppShell, so it does
	// NOT memoize these inline header JSX nodes — they get a fresh element
	// identity on every AppShell render (sidebar/inspector resize ticks, etc.),
	// busting WorkspaceConversationContainer's memo and cascading the whole
	// conversation subtree. Verified via React Profiler: ConversationContainer
	// re-rendered 11× on a single sidebar toggle. Hoist to useMemo so identity
	// is stable except when the inputs actually change.
	const headerLeadingNode = useMemo(
		() => (
			<WorkspaceHeaderLeading
				leftSidebarToggleShortcut={chrome.leftSidebarToggleShortcut}
				showOnDesktop={panels.sidebarCollapsed}
				onExpandSidebar={() => panels.setSidebarCollapsed(false)}
			/>
		),
		[panels.sidebarCollapsed, chrome.leftSidebarToggleShortcut],
	);
	const headerActionsNode = useMemo(
		() =>
			selectedWorkspaceId ? (
				<WorkspaceHeaderActions
					workspaceId={selectedWorkspaceId}
					installedEditors={chrome.installedEditors}
					preferredEditor={chrome.preferredEditor}
					openPreferredEditorShortcut={chrome.openPreferredEditorShortcut}
					rightSidebarToggleShortcut={chrome.rightSidebarToggleShortcut}
					inspectorCollapsed={inspectorCollapsed}
					noGitContext={
						!workspaceModeHasGitContext(data.selectedWorkspaceDetail?.mode)
					}
					onOpenPreferredEditor={chrome.handleOpenPreferredEditor}
					onToggleInspector={() =>
						setInspectorCollapsed((collapsed) => !collapsed)
					}
					onPickEditor={chrome.setPreferredEditorId}
					pushWorkspaceToast={s.pushWorkspaceToast}
				/>
			) : undefined,
		[
			selectedWorkspaceId,
			chrome.installedEditors,
			chrome.preferredEditor,
			chrome.openPreferredEditorShortcut,
			chrome.rightSidebarToggleShortcut,
			chrome.handleOpenPreferredEditor,
			inspectorCollapsed,
			data.selectedWorkspaceDetail?.mode,
			s.pushWorkspaceToast,
		],
	);

	return (
		<AppShellLayout
			providerStack={{
				selectionStore: sel.selectionStore,
				pushWorkspaceToast: s.pushWorkspaceToast,
				sessionRunStates: data.effectiveSessionRunStates,
				insertIntoComposer: data.pendingQueueActions.insertIntoComposer,
			}}
			workspaceViewMode={s.workspaceViewMode}
			sidebar={{
				collapsed: panels.sidebarCollapsed,
				resizing: panels.isSidebarResizing,
				width: panels.sidebarWidth,
				autoSelectSettingsGate: s.workspaceSidebarAutoSelectSettingsGate,
				busyWorkspaceIds: data.effectiveBusyWorkspaceIds,
				interactionRequiredWorkspaceIds: data.interactionRequiredWorkspaceIds,
				newWorkspaceShortcut: chrome.newWorkspaceShortcut,
				addRepositoryShortcut: chrome.addRepositoryShortcut,
				sidebarFilterShortcut: chrome.sidebarFilterShortcut,
				leftSidebarToggleShortcut: chrome.leftSidebarToggleShortcut,
				appSettings: s.appSettings,
				onSelectWorkspace: sel.handleSelectWorkspace,
				onOpenNewWorkspace: s.handleOpenWorkspaceStart,
				onAddRepositoryNeedsStart:
					sel.startSurfaceActions.addRepositoryNeedsStart,
				onMoveLocalToWorktree: sel.startSurfaceActions.moveLocalToWorktree,
				onCollapseSidebar: () => panels.setSidebarCollapsed(true),
				onOpenSettings: data.handleOpenSettings,
				pushWorkspaceToast: s.pushWorkspaceToast,
			}}
			sidebarCollapsed={panels.sidebarCollapsed}
			isSidebarResizing={panels.isSidebarResizing}
			sidebarWidth={panels.sidebarWidth}
			workspacePane={buildWorkspacePaneProps({
				s,
				headerLeadingNode,
				headerActionsNode,
			})}
			rightSidebarAvailable={sel.contextPanel.rightSidebarAvailable}
			selectedWorkspaceDetail={data.selectedWorkspaceDetail}
			inspector={{
				collapsed: inspectorCollapsed,
				resizing: panels.isInspectorResizing,
				width: panels.inspectorWidth,
				// Settle-gated id for the inspector's git-diff. Matches the settled
				// `selectedWorkspaceDetail` / `workspaceRootPath` below so the diff
				// query key stays internally consistent during a rapid-switch burst.
				workspaceId: s.settledWorkspaceId,
				workspaceRootPath: data.workspaceRootPath,
				selectedWorkspaceDetail: data.selectedWorkspaceDetailQuery.data ?? null,
				activeEditor: data.activeEditorTarget,
				preferredEditor: chrome.preferredEditor,
				onOpenEditorFile: data.editorSessionActions.openFile,
				onCommitAction: data.handleCommitAction,
				onReviewAction: () => {
					const reviewModel =
						s.appSettings.reviewModel ?? s.appSettings.defaultModel;
					return data.handleInspectorReviewAction({
						modelId: reviewModel?.modelId ?? null,
						provider: reviewModel?.provider ?? null,
						effort: s.appSettings.reviewEffort ?? s.appSettings.defaultEffort,
						fastMode:
							s.appSettings.reviewFastMode ?? s.appSettings.defaultFastMode,
					});
				},
				onQueuePendingPromptForSession: data.queuePendingPromptForSession,
				commitButtonMode: data.commitButtonMode,
				commitButtonState: data.commitButtonState,
				workspaceChangeRequest: data.workspaceChangeRequest,
				workspaceForgeIsRefreshing: data.workspaceForgeIsRefreshing,
				onOpenSettings: data.handleOpenSettings,
			}}
			inspectorCollapsed={inspectorCollapsed}
			isInspectorResizing={panels.isInspectorResizing}
			inspectorWidth={panels.inspectorWidth}
			handleResizeStart={panels.handleResizeStart}
			handleResizeKeyDown={panels.handleResizeKeyDown}
			overlays={{
				theme: s.appSettings.theme,
				onOpenChangelog: chrome.handleOpenReleaseChangelog,
				onOpenAnnouncementSettings: data.handleOpenAnnouncementSettings,
				onOpenStartPage: () => s.handleOpenWorkspaceStart({ persist: false }),
				quickSwitch: data.quickSwitch,
				liveWorkspaceRowMap: data.liveWorkspaceRowMap,
				closeConfirmDialog: data.closeConfirmDialog,
				terminalResumeDialog: data.terminalResumeDialog,
				editorDiscardConfirmDialog: data.editorDiscardConfirmDialog,
				mergeConfirmDialogNode: data.mergeConfirmDialogNode,
			}}
		/>
	);
}
