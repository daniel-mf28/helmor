import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionSummary } from "@/lib/api";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { useComposerClaudeAccount } from "./use-composer-claude-account";

const apiMocks = vi.hoisted(() => ({
	setSessionClaudeConfigDir: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	setSessionClaudeConfigDir: apiMocks.setSessionClaudeConfigDir,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const PERSONAL = "/Users/me/.claude-personal";
const SETTINGS = {
	...DEFAULT_SETTINGS,
	claudeAccounts: [{ id: "p", label: "Personal", configDir: PERSONAL }],
};
const SUBSCRIPTION_MODEL = { provider: "claude" as const };

function session(
	overrides: Partial<WorkspaceSessionSummary> = {},
): WorkspaceSessionSummary {
	return {
		id: "s1",
		workspaceId: "w1",
		title: "Untitled",
		status: "idle",
		permissionMode: "default",
		unreadCount: 0,
		fastMode: false,
		createdAt: "",
		updatedAt: "",
		isHidden: false,
		active: true,
		...overrides,
	};
}

function setup(
	params: Parameters<typeof useComposerClaudeAccount>[0],
	settings = SETTINGS,
) {
	const updateSettings = vi.fn();
	const queryClient = new QueryClient();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<SettingsContext.Provider
				value={{ settings, isLoaded: true, updateSettings }}
			>
				{children}
			</SettingsContext.Provider>
		</QueryClientProvider>
	);
	const hook = renderHook(() => useComposerClaudeAccount(params), { wrapper });
	return { ...hook, updateSettings };
}

beforeEach(() => {
	apiMocks.setSessionClaudeConfigDir.mockReset();
	apiMocks.setSessionClaudeConfigDir.mockResolvedValue(undefined);
});

describe("useComposerClaudeAccount", () => {
	it("is editable while the session has no messages and persists the pick", async () => {
		const { result, updateSettings } = setup({
			session: session(),
			model: SUBSCRIPTION_MODEL,
		});
		expect(result.current.showPicker).toBe(true);
		expect(result.current.locked).toBe(false);

		await act(() => result.current.selectAccount(PERSONAL));
		expect(apiMocks.setSessionClaudeConfigDir).toHaveBeenCalledWith(
			"s1",
			PERSONAL,
		);
		expect(updateSettings).toHaveBeenCalledWith({
			claudeLastConfigDir: PERSONAL,
		});
	});

	it("locks once the session has messages and shows the session's own account", () => {
		const { result } = setup({
			session: session({
				agentType: "claude",
				lastUserMessageAt: "2026-01-01 00:00:00",
				claudeConfigDir: PERSONAL,
			}),
			model: SUBSCRIPTION_MODEL,
		});
		expect(result.current.locked).toBe(true);
		expect(result.current.selectedConfigDir).toBe(PERSONAL);
		expect(result.current.usageConfigDir).toBe(PERSONAL);
		expect(result.current.usageLabel).toBe("Personal");
	});

	it("previews the last-used account on the start page without touching a session", async () => {
		const { result, updateSettings } = setup(
			{ session: null, model: SUBSCRIPTION_MODEL },
			{ ...SETTINGS, claudeLastConfigDir: PERSONAL },
		);
		expect(result.current.selectedConfigDir).toBe(PERSONAL);
		expect(result.current.locked).toBe(false);
		await act(() => result.current.selectAccount(null));
		expect(apiMocks.setSessionClaudeConfigDir).not.toHaveBeenCalled();
		expect(updateSettings).toHaveBeenCalledWith({ claudeLastConfigDir: null });
	});

	it("hides the picker with one account or a non-subscription model", () => {
		const single = setup(
			{ session: session(), model: SUBSCRIPTION_MODEL },
			{ ...SETTINGS, claudeAccounts: [] },
		);
		expect(single.result.current.showPicker).toBe(false);

		const custom = setup({
			session: session(),
			model: { provider: "claude", providerKey: "custom" },
		});
		expect(custom.result.current.showPicker).toBe(false);
		// Usage falls back to the default account for non-subscription models.
		expect(custom.result.current.usageConfigDir).toBeNull();

		const codex = setup({ session: session(), model: { provider: "codex" } });
		expect(codex.result.current.showPicker).toBe(false);
	});
});
