/**
 * The session's Claude account (`claudeConfigDir`) must reach the SDK
 * `query()` env as `CLAUDE_CONFIG_DIR` on every query path, and must leave
 * the env untouched (no key) for the default account.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
	GenerateTitleOptions,
	GetContextUsageParams,
	ListSlashCommandsParams,
	SendMessageParams,
} from "../session-manager.js";

interface CapturedQuery {
	env: Record<string, string | undefined> | undefined;
	resume: string | undefined;
}
const captured: CapturedQuery[] = [];

function makeQuery(messages: SDKMessage[]) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const m of messages) yield m;
		},
		close() {},
		async supportedCommands() {
			return [{ name: "demo", description: "d", argumentHint: "" }];
		},
		async getContextUsage() {
			return {
				categories: [],
				totalTokens: 0,
				maxTokens: 200_000,
				rawMaxTokens: 200_000,
				percentage: 0,
				model: "claude-test",
			};
		},
	};
}

const TITLE_RESULT = {
	type: "result",
	subtype: "success",
	result: '{"title":"T","branch":"b"}',
	terminal_reason: "completed",
	usage: { input_tokens: 1, output_tokens: 1 },
	modelUsage: {},
	session_id: "s1",
	uuid: "r1",
} as unknown as SDKMessage;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: (args: { options?: CapturedQuery & Record<string, unknown> }) => {
		captured.push({
			env: args.options?.env as CapturedQuery["env"],
			resume: args.options?.resume as string | undefined,
		});
		return makeQuery([TITLE_RESULT]);
	},
}));

const { ClaudeSessionManager } = await import("./session-manager.js");

function spyEmitter() {
	return new Proxy(
		{},
		{ get: () => () => undefined },
	) as unknown as import("../emitter.js").SidecarEmitter;
}

function sendParams(extra: Partial<SendMessageParams>): SendMessageParams {
	return {
		sessionId: "s1",
		prompt: "hi",
		model: "claude-test",
		cwd: undefined,
		resume: undefined,
		permissionMode: "bypassPermissions",
		effortLevel: undefined,
		fastMode: undefined,
		images: [],
		...extra,
	} as SendMessageParams;
}

beforeEach(() => {
	captured.length = 0;
});

describe("claudeConfigDir -> CLAUDE_CONFIG_DIR in query env", () => {
	test("sendMessage sets it when provided", async () => {
		const manager = new ClaudeSessionManager();
		await manager.sendMessage(
			"rid",
			sendParams({ claudeConfigDir: "/Users/me/.claude-personal" }),
			spyEmitter(),
		);
		expect(captured).toHaveLength(1);
		expect(captured[0]?.env?.CLAUDE_CONFIG_DIR).toBe(
			"/Users/me/.claude-personal",
		);
	});

	test("sendMessage leaves it out for the default account", async () => {
		const saved = process.env.CLAUDE_CONFIG_DIR;
		delete process.env.CLAUDE_CONFIG_DIR;
		try {
			const manager = new ClaudeSessionManager();
			await manager.sendMessage("rid", sendParams({}), spyEmitter());
			expect(captured).toHaveLength(1);
			expect(captured[0]?.env).toBeDefined();
			expect(captured[0]?.env).not.toHaveProperty("CLAUDE_CONFIG_DIR");
		} finally {
			if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved;
		}
	});

	test("title generation uses the session's account", async () => {
		const manager = new ClaudeSessionManager();
		const options: GenerateTitleOptions = {
			claudeConfigDir: "/Users/me/.claude-personal",
		};
		await manager
			.generateTitle("rid", "hello", null, spyEmitter(), 5000, options)
			.catch(() => undefined);
		expect(captured.at(-1)?.env?.CLAUDE_CONFIG_DIR).toBe(
			"/Users/me/.claude-personal",
		);
	});

	test("context usage (resume path) uses the session's account", async () => {
		const manager = new ClaudeSessionManager();
		const params: GetContextUsageParams = {
			helmorSessionId: "s-none-live",
			providerSessionId: "prov-1",
			model: "claude-test",
			cwd: undefined,
			claudeConfigDir: "/Users/me/.claude-personal",
		};
		await manager.getContextUsage(params).catch(() => undefined);
		expect(captured.at(-1)?.resume).toBe("prov-1");
		expect(captured.at(-1)?.env?.CLAUDE_CONFIG_DIR).toBe(
			"/Users/me/.claude-personal",
		);
	});
	test("slash-command listing uses the chosen account", async () => {
		const manager = new ClaudeSessionManager();
		const params: ListSlashCommandsParams = {
			cwd: undefined,
			claudeConfigDir: "/Users/me/.claude-personal",
		};
		const commands = await manager.listSlashCommands(params);
		expect(commands.map((c) => c.name)).toEqual(["demo"]);
		expect(captured.at(-1)?.env?.CLAUDE_CONFIG_DIR).toBe(
			"/Users/me/.claude-personal",
		);
	});

	test("slash-command listing leaves it out for the default account", async () => {
		const saved = process.env.CLAUDE_CONFIG_DIR;
		delete process.env.CLAUDE_CONFIG_DIR;
		try {
			const manager = new ClaudeSessionManager();
			await manager.listSlashCommands({ cwd: undefined });
			expect(captured.at(-1)?.env?.CLAUDE_CONFIG_DIR).toBeUndefined();
		} finally {
			if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved;
		}
	});
});
