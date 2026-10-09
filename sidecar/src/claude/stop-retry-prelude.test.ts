/**
 * Regression: Stop a Claude turn, then message the same thread again →
 * "The provider returned an empty response. Please try again."
 *
 * Root cause (reproduced against the bundled claude-code with a real
 * resume): when the interrupted turn still had `run_in_background` tasks
 * alive, the resumed CLI first reports them as `task_notification
 * { status: "stopped" }`, runs that as its OWN zero-round-trip turn and
 * writes a `result` for it (`origin: { kind: "task-notification" }`,
 * `num_turns: 0`, `result: ""`, no `terminal_reason`) — BEFORE it dequeues
 * the user's new prompt. The old loop treated any `result` as terminal:
 * it emitted `end` with no assistant output (Rust → bad-resume error) and
 * `q.close()`d the query while the CLI was about to answer the prompt, so
 * the prompt was silently lost.
 *
 * Fix under test (`session-manager.ts` + `stale-resume-result.ts`): before
 * the turn's own first result, a zero-round-trip task-notification result
 * is skipped and the SAME query keeps draining until the real answer and
 * its terminal result. Exactly one terminal event per turn, no re-send.
 *
 * The message shapes below are trimmed copies of the real SDK events
 * captured from that reproduction.
 */

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
	assistant,
	assistantTexts,
	calls,
	completed,
	completedNotification,
	init,
	makeSpyEmitter,
	PROVIDER_SESSION,
	params,
	resetScenario,
	resultUuids,
	resumeAfterStopStream,
	SESSION,
	setScripts,
	staleNotificationResult,
	stoppedNotification,
	taskStarted,
} from "./stop-retry-prelude.fixture.js";

let ClaudeSessionManager: typeof import("./session-manager.js").ClaudeSessionManager;

beforeAll(async () => {
	({ ClaudeSessionManager } = await import("./session-manager.js"));
});

afterEach(resetScenario);

describe("Claude resume after Stop — stale task-notification prelude", () => {
	test("reopen/restart retry: the new prompt's answer is delivered in the same stream with exactly one end", async () => {
		setScripts([{ messages: resumeAfterStopStream("PONG") }]);
		const manager = new ClaudeSessionManager();
		const spy = makeSpyEmitter();

		await manager.sendMessage(
			"req-retry",
			params(PROVIDER_SESSION, "reply PONG"),
			spy.emitter,
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.resume).toBe(PROVIDER_SESSION);
		// The query was drained to the real answer, not closed at the prelude.
		expect(calls[0]?.yielded).toBe(calls[0]?.total);
		expect(assistantTexts(spy)).toEqual(["PONG"]);
		expect(resultUuids(spy)).toEqual(["r-PONG"]);
		expect(spy.ends).toBe(1);
		expect(spy.aborted).toBe(0);
		expect(spy.errors).toEqual([]);
	});

	test("several killed bg tasks (subagent + shell) each yield a prelude result — all skipped", async () => {
		setScripts([
			{
				messages: [
					stoppedNotification("a0b0eac4dc7e42397"),
					init(),
					staleNotificationResult("stale-1"),
					stoppedNotification("br0urxtjx"),
					init(),
					staleNotificationResult("stale-2"),
					init(),
					assistant("Picking up where it stopped."),
					completed("Picking up where it stopped."),
				],
			},
		]);
		const manager = new ClaudeSessionManager();
		const spy = makeSpyEmitter();

		await manager.sendMessage(
			"req-retry",
			params(PROVIDER_SESSION, "continue"),
			spy.emitter,
		);

		expect(assistantTexts(spy)).toEqual(["Picking up where it stopped."]);
		expect(resultUuids(spy)).toEqual(["r-Picking up where it stopped."]);
		expect(spy.ends).toBe(1);
	});

	test("same-process immediate retry: Stop mid-turn, resend on the same manager → one aborted, then one answered turn", async () => {
		setScripts([
			{
				messages: [init(), taskStarted("bg-shell"), assistant("working…")],
				hangUntilAbort: true,
			},
			{ messages: resumeAfterStopStream("PONG") },
		]);
		const manager = new ClaudeSessionManager();

		const first = makeSpyEmitter();
		const firstTurn = manager.sendMessage(
			"req-long",
			params(PROVIDER_SESSION, "long task"),
			first.emitter,
		);
		// Let the first turn reach its parked, mid-flight state.
		while ((calls[0]?.yielded ?? 0) < 3) {
			await new Promise((r) => setTimeout(r, 1));
		}
		await manager.stopSession(SESSION);
		await firstTurn;

		expect(first.aborted).toBe(1);
		expect(first.ends).toBe(0);
		expect(calls[0]?.closeCount).toBeGreaterThanOrEqual(1);

		const second = makeSpyEmitter();
		await manager.sendMessage(
			"req-retry",
			params(PROVIDER_SESSION, "reply PONG"),
			second.emitter,
		);

		expect(calls).toHaveLength(2); // no duplicate prompt execution
		expect(calls[1]?.resume).toBe(PROVIDER_SESSION);
		expect(assistantTexts(second)).toEqual(["PONG"]);
		expect(resultUuids(second)).toEqual(["r-PONG"]);
		expect(second.ends).toBe(1);
		expect(second.aborted).toBe(0);
		// The retry's events never leak into the stopped turn.
		expect(first.passthroughs.some((m) => m.uuid === "r-PONG")).toBe(false);
	});

	test("CLI exits after the prelude without answering → still exactly one end, prelude never reaches the pipeline", async () => {
		setScripts([
			{
				messages: [
					stoppedNotification("bl5fk0zqr"),
					init(),
					staleNotificationResult("stale-1"),
				],
			},
		]);
		const manager = new ClaudeSessionManager();
		const spy = makeSpyEmitter();

		await manager.sendMessage(
			"req-retry",
			params(PROVIDER_SESSION, "reply PONG"),
			spy.emitter,
		);

		// Rust sees an empty resumed turn and surfaces its retry error —
		// truthful here, because the prompt really went unanswered.
		expect(resultUuids(spy)).toEqual([]);
		expect(spy.ends).toBe(1);
	});

	test("narrowness: a task-notification result that ran the model is terminal", async () => {
		const ranModel = {
			...(staleNotificationResult("notif-ran") as object),
			num_turns: 1,
			result: "Background task finished.",
		} as unknown as SDKMessage;
		setScripts([
			{
				messages: [
					init(),
					assistant("Background task finished."),
					ranModel,
					assistant("never reached"),
				],
			},
		]);
		const manager = new ClaudeSessionManager();
		const spy = makeSpyEmitter();

		await manager.sendMessage(
			"req",
			params(PROVIDER_SESSION, "hi"),
			spy.emitter,
		);

		expect(resultUuids(spy)).toEqual(["notif-ran"]);
		expect(assistantTexts(spy)).toEqual(["Background task finished."]);
		expect(spy.ends).toBe(1);
	});

	test("narrowness: after this turn's own (deferred) result, a task-notification result ends the turn", async () => {
		setScripts([
			{
				messages: [
					init(),
					taskStarted("bg1"),
					assistant("started bg work"),
					completed("started bg work", "own-completed"),
					completedNotification("bg1"),
					staleNotificationResult("bg-drain-final"),
					assistant("never reached"),
				],
			},
		]);
		const manager = new ClaudeSessionManager();
		const spy = makeSpyEmitter();

		await manager.sendMessage(
			"req",
			params(PROVIDER_SESSION, "do bg work"),
			spy.emitter,
		);

		expect(resultUuids(spy)).toEqual(["bg-drain-final"]);
		expect(assistantTexts(spy)).toEqual(["started bg work"]);
		expect(spy.ends).toBe(1);
	});
});
