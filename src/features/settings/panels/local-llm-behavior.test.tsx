import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { renderWithProviders } from "@/test/render-with-providers";
import { LocalLlmBehaviorSection } from "./local-llm-behavior";

const apiMocks = vi.hoisted(() => ({
	startLocalLlm: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return { ...actual, startLocalLlm: apiMocks.startLocalLlm };
});

function settingsWith(local: Partial<AppSettings["localLlm"]>): AppSettings {
	return {
		...DEFAULT_SETTINGS,
		localLlm: { ...DEFAULT_SETTINGS.localLlm, enabled: true, ...local },
	};
}

describe("LocalLlmBehaviorSection", () => {
	beforeEach(() => {
		apiMocks.startLocalLlm.mockResolvedValue(undefined);
	});
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("defaults to thinking off and project instructions on", () => {
		expect(DEFAULT_SETTINGS.localLlm.thinking).toBe(false);
		expect(DEFAULT_SETTINGS.localLlm.readProjectInstructions).toBe(true);
	});

	it("turning thinking on saves it and restarts the model in that mode", async () => {
		const updateSettings = vi.fn().mockResolvedValue(undefined);
		renderWithProviders(
			<LocalLlmBehaviorSection
				settings={settingsWith({ model: "/m/nex.gguf" })}
				updateSettings={updateSettings}
				modelLoaded
			/>,
		);

		fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));

		await waitFor(() => expect(apiMocks.startLocalLlm).toHaveBeenCalled());
		expect(updateSettings).toHaveBeenCalledWith({
			localLlm: expect.objectContaining({
				thinking: true,
				model: "/m/nex.gguf",
			}),
		});
	});

	it("doesn't start a server for thinking when no model is selected", async () => {
		const updateSettings = vi.fn().mockResolvedValue(undefined);
		renderWithProviders(
			<LocalLlmBehaviorSection
				settings={settingsWith({})}
				updateSettings={updateSettings}
				modelLoaded={false}
			/>,
		);

		fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));

		await waitFor(() => expect(updateSettings).toHaveBeenCalled());
		expect(apiMocks.startLocalLlm).not.toHaveBeenCalled();
	});

	it("turning project instructions off saves it without a restart", async () => {
		const updateSettings = vi.fn().mockResolvedValue(undefined);
		renderWithProviders(
			<LocalLlmBehaviorSection
				settings={settingsWith({ model: "/m/nex.gguf" })}
				updateSettings={updateSettings}
				modelLoaded
			/>,
		);

		fireEvent.click(
			screen.getByRole("switch", { name: "Read project instructions" }),
		);

		await waitFor(() =>
			expect(updateSettings).toHaveBeenCalledWith({
				localLlm: expect.objectContaining({ readProjectInstructions: false }),
			}),
		);
		expect(apiMocks.startLocalLlm).not.toHaveBeenCalled();
	});
});
