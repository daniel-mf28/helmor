// Right-sidebar controller: owns the inspector-collapsed flag and derives
// whether the right sidebar is available at all (it is hidden on the
// workspace-start surface, which has no right pane).
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import type { ShellViewMode } from "@/shell/controllers/use-selection-controller";
import { useStableActions } from "@/shell/hooks/use-stable-actions";

export type ContextPanelState = {
	inspectorCollapsed: boolean;
	rightSidebarAvailable: boolean;
};

export type ContextPanelActions = {
	setInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
};

export type ContextPanelController = {
	state: ContextPanelState;
	actions: ContextPanelActions;
};

export type ContextPanelControllerDeps = {
	getViewMode(): ShellViewMode;
};

export function useContextPanelController(
	deps: ContextPanelControllerDeps,
): ContextPanelController {
	const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

	const rightSidebarAvailable = deps.getViewMode() !== "start";

	const actions = useStableActions<ContextPanelActions>({
		setInspectorCollapsed,
	});

	const state = useMemo<ContextPanelState>(
		() => ({
			inspectorCollapsed,
			rightSidebarAvailable,
		}),
		[inspectorCollapsed, rightSidebarAvailable],
	);

	return { state, actions };
}
