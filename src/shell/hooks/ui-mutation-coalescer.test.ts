import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiMutationEvent } from "@/lib/api";
import { createUiMutationCoalescer } from "./use-ui-sync-bridge";

const files = (workspaceId: string) =>
	({ type: "workspaceFilesChanged", workspaceId }) as UiMutationEvent;

describe("createUiMutationCoalescer", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("runs the first event immediately and collapses a burst into one trailing run", () => {
		const run = vi.fn();
		const c = createUiMutationCoalescer(run, 100);
		for (let i = 0; i < 5; i++) c.push(files("w1"));
		expect(run).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(100);
		expect(run).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(500);
		expect(run).toHaveBeenCalledTimes(2);
		c.dispose();
	});

	it("keeps distinct events independent and never delays non-coalesced types", () => {
		const run = vi.fn();
		const c = createUiMutationCoalescer(run, 100);
		c.push(files("w1"));
		c.push(files("w2"));
		expect(run).toHaveBeenCalledTimes(2);
		const settings = { type: "settingsChanged", key: "app.x" } as UiMutationEvent;
		c.push(settings);
		c.push(settings);
		expect(run).toHaveBeenCalledTimes(4);
		c.dispose();
	});
});
