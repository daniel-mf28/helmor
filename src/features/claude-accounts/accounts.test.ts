import { describe, expect, it } from "vitest";
import {
	buildClaudeAccounts,
	DEFAULT_CLAUDE_ACCOUNT_ID,
	findClaudeAccount,
	isClaudeSubscriptionModel,
} from "./accounts";

const settings = {
	claudeDefaultAccountLabel: "Work",
	claudeAccounts: [
		{ id: "p", label: "Personal", configDir: "/Users/me/.claude-personal" },
	],
};

describe("buildClaudeAccounts", () => {
	it("puts the default account first, labelled from settings", () => {
		const accounts = buildClaudeAccounts(settings);
		expect(accounts.map((a) => a.label)).toEqual(["Work", "Personal"]);
		expect(accounts[0]).toMatchObject({
			id: DEFAULT_CLAUDE_ACCOUNT_ID,
			configDir: null,
		});
	});
});

describe("findClaudeAccount", () => {
	const accounts = buildClaudeAccounts(settings);

	it("resolves null/blank to the default account", () => {
		expect(findClaudeAccount(accounts, null).label).toBe("Work");
		expect(findClaudeAccount(accounts, undefined).label).toBe("Work");
		expect(findClaudeAccount(accounts, "  ").label).toBe("Work");
	});

	it("matches a configured dir", () => {
		expect(
			findClaudeAccount(accounts, "/Users/me/.claude-personal").label,
		).toBe("Personal");
	});

	it("labels a removed account by its folder name", () => {
		const account = findClaudeAccount(accounts, "/Users/me/.claude-old/");
		expect(account.label).toBe(".claude-old");
		expect(account.configDir).toBe("/Users/me/.claude-old/");
	});
});

describe("isClaudeSubscriptionModel", () => {
	it("is true only for plain claude models", () => {
		expect(isClaudeSubscriptionModel({ provider: "claude" })).toBe(true);
		expect(
			isClaudeSubscriptionModel({ provider: "claude", providerKey: "custom" }),
		).toBe(false);
		expect(isClaudeSubscriptionModel({ provider: "codex" })).toBe(false);
		expect(isClaudeSubscriptionModel(null)).toBe(false);
	});
});
