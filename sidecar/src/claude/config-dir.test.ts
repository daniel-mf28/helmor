import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeConfigDirEnv, expandClaudeConfigDir } from "./config-dir.js";

describe("expandClaudeConfigDir", () => {
	it("returns undefined for blank / missing / relative input", () => {
		expect(expandClaudeConfigDir(undefined)).toBeUndefined();
		expect(expandClaudeConfigDir(null)).toBeUndefined();
		expect(expandClaudeConfigDir("   ")).toBeUndefined();
		expect(expandClaudeConfigDir("relative/dir")).toBeUndefined();
	});

	it("expands ~ and strips trailing slashes", () => {
		expect(expandClaudeConfigDir("~/.claude-personal")).toBe(
			join(homedir(), ".claude-personal"),
		);
		expect(expandClaudeConfigDir("~")).toBe(homedir());
		expect(expandClaudeConfigDir("/opt/claude-x///")).toBe("/opt/claude-x");
	});
});

describe("claudeConfigDirEnv", () => {
	it("sets CLAUDE_CONFIG_DIR for an account dir", () => {
		expect(claudeConfigDirEnv("/Users/me/.claude-personal")).toEqual({
			CLAUDE_CONFIG_DIR: "/Users/me/.claude-personal",
		});
	});

	it("is undefined for the default account", () => {
		expect(claudeConfigDirEnv(undefined)).toBeUndefined();
		expect(claudeConfigDirEnv("")).toBeUndefined();
	});
});
