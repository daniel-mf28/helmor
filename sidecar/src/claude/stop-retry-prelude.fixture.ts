/** SDK event fixtures and query mock for stop-then-retry regression tests. */
import { mock } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SidecarEmitter } from "../emitter.js";
import type { SendMessageParams } from "../session-manager.js";

interface Script {
	messages: SDKMessage[];
	/** Park after the messages until the turn's AbortController fires —
	 *  models a long turn the user Stops mid-flight. */
	hangUntilAbort?: boolean;
}

interface QueryCall {
	resume: string | undefined;
	yielded: number;
	total: number;
	closeCount: number;
}

let scripts: Script[] = [];
export const calls: QueryCall[] = [];

export function setScripts(next: Script[]): void {
	scripts = next;
}

export function resetScenario(): void {
	scripts = [];
	calls.length = 0;
}

function makeQuery(script: Script, options: Record<string, unknown>) {
	const call: QueryCall = {
		resume: options.resume as string | undefined,
		yielded: 0,
		total: script.messages.length,
		closeCount: 0,
	};
	calls.push(call);
	const signal = (options.abortController as AbortController).signal;
	let closed = false;
	return {
		async *[Symbol.asyncIterator]() {
			for (const m of script.messages) {
				if (closed) return;
				call.yielded += 1;
				yield m;
				// Let other tasks (e.g. a Stop) interleave between events, like
				// the real stdout-driven iterator does.
				await Promise.resolve();
			}
			if (script.hangUntilAbort && !closed) {
				// Ref'd heartbeat so the parked iterator keeps the loop alive on
				// every platform (see background-resume.test.ts).
				const heartbeat = setInterval(() => {}, 1000);
				try {
					await new Promise<void>((_resolve, reject) => {
						const fail = () =>
							reject(new Error("Claude Code process aborted by user"));
						if (signal.aborted) fail();
						signal.addEventListener("abort", fail, { once: true });
					});
				} finally {
					clearInterval(heartbeat);
				}
			}
		},
		close() {
			call.closeCount += 1;
			closed = true;
		},
	};
}

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: ({ options }: { options: Record<string, unknown> }) =>
		makeQuery(scripts.shift() ?? { messages: [] }, options),
}));

export interface EmitterSpy {
	passthroughs: Array<Record<string, unknown>>;
	ends: number;
	aborted: number;
	errors: string[];
	emitter: SidecarEmitter;
}

export function makeSpyEmitter(): EmitterSpy {
	const spy: EmitterSpy = {
		passthroughs: [],
		ends: 0,
		aborted: 0,
		errors: [],
		emitter: undefined as unknown as SidecarEmitter,
	};
	spy.emitter = new Proxy(
		{},
		{
			get(_t, prop) {
				if (prop === "passthrough") {
					return (_id: string, message: Record<string, unknown>) =>
						spy.passthroughs.push(message);
				}
				if (prop === "end") {
					return () => {
						spy.ends += 1;
					};
				}
				if (prop === "aborted") {
					return () => {
						spy.aborted += 1;
					};
				}
				if (prop === "error") {
					return (_id: string, message: string) => spy.errors.push(message);
				}
				return () => undefined;
			},
		},
	) as SidecarEmitter;
	return spy;
}

export const SESSION = "06427914-helmor-session";
export const PROVIDER_SESSION = "dd85b4b7-provider-session";
const MODEL = "claude-test";
const USAGE = { input_tokens: 1000, output_tokens: 10 };
const MODEL_USAGE = { [MODEL]: { contextWindow: 200_000 } };

export function init(): SDKMessage {
	return {
		type: "system",
		subtype: "init",
		session_id: PROVIDER_SESSION,
		uuid: `init-${Math.random()}`,
	} as unknown as SDKMessage;
}

/** What the resumed CLI reports for a bg task killed with the old process. */
export function stoppedNotification(taskId: string): SDKMessage {
	return {
		type: "system",
		subtype: "task_notification",
		task_id: taskId,
		tool_use_id: `toolu-${taskId}`,
		status: "stopped",
		output_file: "",
		summary:
			"Background shell command didn't finish before the previous session ended",
		session_id: PROVIDER_SESSION,
		uuid: `tn-${taskId}`,
	} as unknown as SDKMessage;
}

/** The stale prelude result (captured shape, trimmed). */
export function staleNotificationResult(uuid: string): SDKMessage {
	return {
		type: "result",
		subtype: "success",
		is_error: false,
		result: "",
		num_turns: 0,
		duration_api_ms: 0,
		stop_reason: null,
		origin: { kind: "task-notification" },
		queued_turn_count: 0,
		result_index: 0,
		usage: USAGE,
		modelUsage: MODEL_USAGE,
		session_id: PROVIDER_SESSION,
		uuid,
	} as unknown as SDKMessage;
}

export function assistant(text: string): SDKMessage {
	return {
		type: "assistant",
		message: {
			role: "assistant",
			model: MODEL,
			content: [{ type: "text", text }],
		},
		parent_tool_use_id: null,
		session_id: PROVIDER_SESSION,
		uuid: `a-${text}`,
	} as unknown as SDKMessage;
}

export function completed(text: string, uuid = `r-${text}`): SDKMessage {
	return {
		type: "result",
		subtype: "success",
		is_error: false,
		result: text,
		num_turns: 1,
		stop_reason: "end_turn",
		terminal_reason: "completed",
		usage: USAGE,
		modelUsage: MODEL_USAGE,
		session_id: PROVIDER_SESSION,
		uuid,
	} as unknown as SDKMessage;
}

export function taskStarted(taskId: string): SDKMessage {
	return {
		type: "system",
		subtype: "task_started",
		task_id: taskId,
		tool_use_id: `toolu-${taskId}`,
		session_id: PROVIDER_SESSION,
		uuid: `ts-${taskId}`,
	} as unknown as SDKMessage;
}

export function completedNotification(taskId: string): SDKMessage {
	return {
		...(stoppedNotification(taskId) as object),
		status: "completed",
		summary: "done",
		uuid: `tnc-${taskId}`,
	} as unknown as SDKMessage;
}

export function params(
	resume: string | undefined,
	prompt: string,
): SendMessageParams {
	return {
		sessionId: SESSION,
		prompt,
		model: MODEL,
		cwd: undefined,
		resume,
		permissionMode: "bypassPermissions",
		effortLevel: undefined,
		fastMode: undefined,
	} as SendMessageParams;
}

/** The real resume-after-Stop stream, in observed order. */
export function resumeAfterStopStream(answer: string): SDKMessage[] {
	return [
		stoppedNotification("bl5fk0zqr"),
		init(),
		staleNotificationResult("stale-1"),
		init(),
		assistant(answer),
		completed(answer),
	];
}

export function resultUuids(spy: EmitterSpy): unknown[] {
	return spy.passthroughs.filter((m) => m.type === "result").map((m) => m.uuid);
}

export function assistantTexts(spy: EmitterSpy): string[] {
	return spy.passthroughs
		.filter((m) => m.type === "assistant")
		.map(
			(m) =>
				(m.message as { content: Array<{ text?: string }> }).content[0]?.text ??
				"",
		);
}
