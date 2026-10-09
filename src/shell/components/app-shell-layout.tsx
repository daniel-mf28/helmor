// Assembly layout for the whole app surface. Holds the static DOM frame (the
// <main> + the sidebar / workspace-pane / inspector three-column grid) and the
// provider stack + overlays around it. All data/handlers arrive pre-computed
// from the AppShell orchestration layer as grouped child-prop bags — this file
// is pure structure + wiring, no state of its own. Lifted verbatim out of
// AppShell's return; the header memo nodes stay computed upstream and ride in
// via `workspacePane`.
import type { ComponentProps, KeyboardEvent, PointerEvent } from "react";
import { type WorkspaceDetail, workspaceModeHasGitContext } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ShellViewMode } from "@/shell/controllers/use-selection-controller";
import { AppOverlays } from "./app-overlays";
import { AppShellProviderStack } from "./app-shell-provider-stack";
import { ShellInspectorPane } from "./shell-inspector-pane";
import { ShellResizeSeparator } from "./shell-resize-separator";
import { ShellSidebarPane } from "./shell-sidebar-pane";
import { WorkspacePaneSurface } from "./workspace-pane-surface";

type ResizeTarget = "sidebar" | "inspector";

type Props = {
	providerStack: Omit<ComponentProps<typeof AppShellProviderStack>, "children">;
	workspaceViewMode: ShellViewMode;
	// Left sidebar + its resize separator.
	sidebar: ComponentProps<typeof ShellSidebarPane>;
	sidebarCollapsed: boolean;
	isSidebarResizing: boolean;
	sidebarWidth: number;
	// Center pane.
	workspacePane: ComponentProps<typeof WorkspacePaneSurface>;
	// Right inspector + its resize separator + visibility gate.
	rightSidebarAvailable: boolean;
	selectedWorkspaceDetail: WorkspaceDetail | null;
	inspector: ComponentProps<typeof ShellInspectorPane>;
	inspectorCollapsed: boolean;
	isInspectorResizing: boolean;
	inspectorWidth: number;
	handleResizeStart: (
		target: ResizeTarget,
	) => (event: PointerEvent<HTMLDivElement>) => void;
	handleResizeKeyDown: (
		target: ResizeTarget,
	) => (event: KeyboardEvent<HTMLDivElement>) => void;
	overlays: ComponentProps<typeof AppOverlays>;
};

export function AppShellLayout({
	providerStack,
	workspaceViewMode,
	sidebar,
	sidebarCollapsed,
	isSidebarResizing,
	sidebarWidth,
	workspacePane,
	rightSidebarAvailable,
	selectedWorkspaceDetail,
	inspector,
	inspectorCollapsed,
	isInspectorResizing,
	inspectorWidth,
	handleResizeStart,
	handleResizeKeyDown,
	overlays,
}: Props) {
	const { t } = useI18n();
	return (
		<AppShellProviderStack {...providerStack}>
			<main
				aria-label={t("applicationShell")}
				className="relative h-dvh overflow-hidden bg-background font-sans text-foreground antialiased"
			>
				<div className="relative flex h-full min-h-0 bg-background">
					{workspaceViewMode !== "editor" && (
						<>
							<ShellSidebarPane {...sidebar} />
							<ShellResizeSeparator
								side="sidebar"
								collapsed={sidebarCollapsed}
								resizing={isSidebarResizing}
								width={sidebarWidth}
								onPointerDown={handleResizeStart("sidebar")}
								onKeyDown={handleResizeKeyDown("sidebar")}
							/>
						</>
					)}

					<WorkspacePaneSurface {...workspacePane} />

					{rightSidebarAvailable &&
						workspaceModeHasGitContext(selectedWorkspaceDetail?.mode) && (
							<>
								<ShellResizeSeparator
									side="inspector"
									collapsed={inspectorCollapsed}
									resizing={isInspectorResizing}
									width={inspectorWidth}
									onPointerDown={handleResizeStart("inspector")}
									onKeyDown={handleResizeKeyDown("inspector")}
								/>
								<ShellInspectorPane {...inspector} />
							</>
						)}
				</div>
			</main>
			<AppOverlays {...overlays} />
		</AppShellProviderStack>
	);
}
