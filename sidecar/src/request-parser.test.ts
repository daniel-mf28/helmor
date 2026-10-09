import { describe, expect, test } from "bun:test";
import { parseListSlashCommandsParams } from "./request-parser.js";

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
