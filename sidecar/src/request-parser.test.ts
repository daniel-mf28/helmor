import { describe, expect, test } from "bun:test";
import {
	parseListSlashCommandsParams,
	parseSendMessageParams,
} from "./request-parser.js";

describe("parseListSlashCommandsParams", () => {
	test("forwards claudeConfigDir", () => {
		const parsed = parseListSlashCommandsParams({
			provider: "claude",
			cwd: "/repo",
			claudeConfigDir: "/Users/me/.claude-personal",
		});
		expect(parsed.claudeConfigDir).toBe("/Users/me/.claude-personal");
		expect(parsed.cwd).toBe("/repo");
	});

	test("leaves claudeConfigDir undefined for the default account", () => {
		const parsed = parseListSlashCommandsParams({ provider: "claude" });
		expect(parsed.claudeConfigDir).toBeUndefined();
	});
});

describe("parseSendMessageParams claudeSettings", () => {
	const base = {
		sessionId: "s-1",
		prompt: "hi",
		provider: "claude",
	};

	// Local-model turns deny web tools through a nested settings list.
	test("accepts nested JSON settings values", () => {
		const parsed = parseSendMessageParams({
			...base,
			claudeSettings: {
				permissions: { deny: ["WebSearch", "WebFetch"] },
				enableAllProjectMcpServers: false,
			},
		});
		expect(parsed.claudeSettings).toEqual({
			permissions: { deny: ["WebSearch", "WebFetch"] },
			enableAllProjectMcpServers: false,
		});
	});

	test("still accepts string-valued settings", () => {
		const parsed = parseSendMessageParams({
			...base,
			claudeSettings: { apiKeyHelper: "security find-generic-password" },
		});
		expect(parsed.claudeSettings).toEqual({
			apiKeyHelper: "security find-generic-password",
		});
	});

	test("rejects a non-object settings value", () => {
		expect(() =>
			parseSendMessageParams({ ...base, claudeSettings: ["x"] }),
		).toThrow("params.claudeSettings must be an object");
	});
});
