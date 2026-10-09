import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { ClaudeAccountsSeeder } from "./seeder";

const apiMocks = vi.hoisted(() => ({ detectClaudeConfigDirs: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	detectClaudeConfigDirs: apiMocks.detectClaudeConfigDirs,
}));

function renderSeeder(settings = DEFAULT_SETTINGS) {
	const updateSettings = vi.fn();
	render(
		<SettingsContext.Provider
			value={{ settings, isLoaded: true, updateSettings }}
		>
			<ClaudeAccountsSeeder />
		</SettingsContext.Provider>,
	);
	return updateSettings;
}

beforeEach(() => apiMocks.detectClaudeConfigDirs.mockReset());

describe("ClaudeAccountsSeeder", () => {
	it("adds detected ~/.claude-* dirs once and marks seeding done", async () => {
		apiMocks.detectClaudeConfigDirs.mockResolvedValue([
			{ configDir: "/Users/me/.claude-personal", label: "Personal" },
		]);
		const updateSettings = renderSeeder();
		await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
		const patch = updateSettings.mock.calls[0]?.[0];
		expect(patch.claudeAccountsSeeded).toBe(true);
		expect(patch.claudeAccounts).toHaveLength(1);
		expect(patch.claudeAccounts[0]).toMatchObject({
			label: "Personal",
			configDir: "/Users/me/.claude-personal",
		});
	});

	it("does nothing once seeded (removed accounts stay removed)", () => {
		const updateSettings = renderSeeder({
			...DEFAULT_SETTINGS,
			claudeAccountsSeeded: true,
		});
		expect(apiMocks.detectClaudeConfigDirs).not.toHaveBeenCalled();
		expect(updateSettings).not.toHaveBeenCalled();
	});
});
