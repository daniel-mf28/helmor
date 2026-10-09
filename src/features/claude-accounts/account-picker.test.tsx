import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import { ClaudeAccountPicker } from "./account-picker";
import type { ClaudeAccount } from "./accounts";

const ACCOUNTS: ClaudeAccount[] = [
	{ id: "default", label: "Work", configDir: null },
	{ id: "p", label: "Personal", configDir: "/Users/me/.claude-personal" },
];

afterEach(cleanup);

describe("ClaudeAccountPicker", () => {
	it("lets the user switch account before the first message", async () => {
		const onSelect = vi.fn();
		renderWithProviders(
			<ClaudeAccountPicker
				accounts={ACCOUNTS}
				selectedConfigDir={null}
				locked={false}
				onSelect={onSelect}
			/>,
		);
		const trigger = screen.getByRole("button", { name: /claude account/i });
		expect(trigger).toHaveTextContent("Work");

		await userEvent.click(trigger);
		await userEvent.click(await screen.findByText("Personal"));
		expect(onSelect).toHaveBeenCalledWith("/Users/me/.claude-personal");
	});

	it("shows the default account as the one without a config dir", async () => {
		const onSelect = vi.fn();
		renderWithProviders(
			<ClaudeAccountPicker
				accounts={ACCOUNTS}
				selectedConfigDir="/Users/me/.claude-personal"
				locked={false}
				onSelect={onSelect}
			/>,
		);
		const trigger = screen.getByRole("button", { name: /claude account/i });
		expect(trigger).toHaveTextContent("Personal");
		await userEvent.click(trigger);
		await userEvent.click(
			await screen.findByRole("menuitem", { name: /Work/ }),
		);
		expect(onSelect).toHaveBeenCalledWith(null);
	});

	it("locks to a read-only label with an explanation once the chat has messages", async () => {
		const onSelect = vi.fn();
		renderWithProviders(
			<ClaudeAccountPicker
				accounts={ACCOUNTS}
				selectedConfigDir="/Users/me/.claude-personal"
				locked
				onSelect={onSelect}
			/>,
		);
		const locked = screen.getByTestId("claude-account-locked");
		expect(locked).toHaveTextContent("Personal");
		expect(locked).toHaveAttribute("aria-disabled", "true");

		// No menu can be opened.
		await userEvent.click(locked);
		expect(screen.queryByRole("menu")).toBeNull();
		expect(onSelect).not.toHaveBeenCalled();

		// Hover/focus explains why.
		await userEvent.unhover(locked);
		await userEvent.hover(locked);
		expect(
			(
				await screen.findAllByText(
					"Account is fixed for this chat. Start a new chat to switch.",
				)
			).length,
		).toBeGreaterThan(0);
	});
});
