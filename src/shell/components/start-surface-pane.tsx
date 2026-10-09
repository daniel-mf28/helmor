// Start-surface content: the `WorkspaceStartPage` chrome wrapping a
// `WorkspaceConversationContainer` rendered with null selection tracks (the
// start composer creates a workspace on submit, so there is no pre-existing
// workspace/session to bind to — zero selection subscription). Lifted verbatim
// out of AppShell's `workspaceViewMode === "start"` branch; only the delivery
// channel changed.
import {
	type ComposerCreateContext,
	WorkspaceConversationContainer,
	type WorkspaceConversationContainerProps,
} from "@/features/conversation";
import { WorkspaceStartPage } from "@/features/workspace-start";
import type { RepositoryCreateOption } from "@/lib/api";
import type { EditorSessionActions } from "@/shell/controllers/use-editor-session-controller";
import type { PendingQueueActions } from "@/shell/controllers/use-pending-queue-controller";
import type { ReadStateActions } from "@/shell/controllers/use-read-state-controller";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import type { StartSurfaceActions } from "@/shell/controllers/use-start-surface-controller";

type ConversationProps = WorkspaceConversationContainerProps;

type Props = {
	repositories: RepositoryCreateOption[];
	startRepository: RepositoryCreateOption | null;
	startSourceBranch: string;
	startBranches: Parameters<typeof WorkspaceStartPage>[0]["branches"];
	startBranchesLoading: boolean;
	startMode: Parameters<typeof WorkspaceStartPage>[0]["mode"];
	startBranchIntent: Parameters<typeof WorkspaceStartPage>[0]["branchIntent"];
	startComposerContextKey: string;
	startCreateContext: ComposerCreateContext | null;
	startLinkedDirectoriesController: ConversationProps["composerLinkedDirectoriesController"];
	startComposerSettingsController: ConversationProps["composerSettingsController"];
	startSurfaceActions: StartSurfaceActions;
	selectionActions: SelectionActions;
	readStateActions: ReadStateActions;
	editorSessionActions: EditorSessionActions;
	pendingQueueActions: PendingQueueActions;
	activeStreams: ConversationProps["activeStreams"];
	effectiveBusySessionIds: Set<string>;
	effectiveStoppableSessionIds: Set<string>;
	interactionRequiredSessionIds: Set<string>;
	pendingComposerInserts: ConversationProps["pendingInsertRequests"];
	onSelectSession: (sessionId: string | null) => void;
	onRequestCloseSession: ConversationProps["onRequestCloseSession"];
	onPendingPromptConsumed: () => void;
	queuePendingPromptForSession: ConversationProps["onQueuePendingPromptForSession"];
	headerLeading: React.ReactNode;
	/** Quick panel: composer pinned to the bottom, heading centered above. */
	composerAtBottom?: boolean;
};

export function StartSurfacePane({
	repositories,
	startRepository,
	startSourceBranch,
	startBranches,
	startBranchesLoading,
	startMode,
	startBranchIntent,
	startComposerContextKey,
	startCreateContext,
	startLinkedDirectoriesController,
	startComposerSettingsController,
	startSurfaceActions,
	selectionActions,
	readStateActions,
	editorSessionActions,
	pendingQueueActions,
	activeStreams,
	effectiveBusySessionIds,
	effectiveStoppableSessionIds,
	interactionRequiredSessionIds,
	pendingComposerInserts,
	onSelectSession,
	onRequestCloseSession,
	onPendingPromptConsumed,
	queuePendingPromptForSession,
	headerLeading,
	composerAtBottom,
}: Props) {
	return (
		<WorkspaceStartPage
			repositories={repositories}
			selectedRepository={startRepository}
			onSelectRepository={startSurfaceActions.selectRepository}
			selectedBranch={startSourceBranch}
			branches={startBranches}
			branchesLoading={startBranchesLoading}
			onOpenBranchPicker={startSurfaceActions.refetchBranches}
			onSelectBranch={startSurfaceActions.selectSourceBranch}
			mode={startMode}
			onModeChange={startSurfaceActions.selectMode}
			branchIntent={startBranchIntent}
			onBranchIntentChange={startSurfaceActions.selectBranchIntent}
			onCreateAndCheckoutBranch={async (branch) => {
				if (!startRepository) return;
				// Lazy: just remember the desired name. Actual
				// `git checkout -b` runs at submit time inside
				// `startSurfaceActions.prepareComposer`.
				startSurfaceActions.stashPendingNewBranch(branch);
			}}
			headerLeading={headerLeading}
			composerAtBottom={composerAtBottom}
		>
			<WorkspaceConversationContainer
				selectedWorkspaceId={null}
				displayedWorkspaceId={null}
				selectedSessionId={null}
				displayedSessionId={null}
				repoId={startRepository?.id ?? null}
				sessionSelectionHistory={[]}
				onSelectSession={onSelectSession}
				onResolveDisplayedSession={selectionActions.resolveDisplayedSession}
				onInteractionSessionsChange={
					readStateActions.onInteractionSessionsChange
				}
				activeStreams={activeStreams}
				busySessionIds={effectiveBusySessionIds}
				stoppableSessionIds={effectiveStoppableSessionIds}
				interactionRequiredSessionIds={interactionRequiredSessionIds}
				onSessionCompleted={readStateActions.onSessionCompleted}
				workspaceChangeRequest={null}
				onSessionAborted={readStateActions.onSessionAborted}
				pendingPromptForSession={null}
				onPendingPromptConsumed={onPendingPromptConsumed}
				pendingInsertRequests={pendingComposerInserts}
				onPendingInsertRequestsConsumed={
					pendingQueueActions.consumeComposerInserts
				}
				onQueuePendingPromptForSession={queuePendingPromptForSession}
				onRequestCloseSession={onRequestCloseSession}
				workspaceRootPath={null}
				onOpenFileReference={editorSessionActions.openFileReference}
				composerOnly
				composerWrapperClassName="w-full"
				composerForceAvailable={
					Boolean(startRepository) || startMode === "chat"
				}
				composerContextKeyOverride={startComposerContextKey}
				composerPlaceholder="miscDescribeWhatYouWantToBuild"
				composerCreateContext={startCreateContext}
				composerFocusScope="start-composer"
				composerTerminalModeAvailable={startMode !== "chat"}
				composerStartSubmitMenu
				composerLinkedDirectoriesController={startLinkedDirectoriesController}
				composerSettingsController={startComposerSettingsController}
			/>
		</WorkspaceStartPage>
	);
}
