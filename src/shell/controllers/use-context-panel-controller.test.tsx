import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useContextPanelController } from "./use-context-panel-controller";
import type { ShellViewMode } from "./use-selection-controller";

function renderController(viewMode: ShellViewMode = "conversation") {
	return renderHook(() =>
		useContextPanelController({
			getViewMode: () => viewMode,
		}),
	);
}

describe("useContextPanelController", () => {
	it("starts with the inspector expanded and toggles collapse", () => {
		const { result } = renderController();

		expect(result.current.state.inspectorCollapsed).toBe(false);
		expect(result.current.state.rightSidebarAvailable).toBe(true);

		act(() => {
			result.current.actions.setInspectorCollapsed(true);
		});
		expect(result.current.state.inspectorCollapsed).toBe(true);
	});

	it("hides the right sidebar on the start page", () => {
		const { result } = renderController("start");

		expect(result.current.state.rightSidebarAvailable).toBe(false);
	});
});
