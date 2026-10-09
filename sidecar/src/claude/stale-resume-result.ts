import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Stale notification-only `result` that claude-code emits when it RESUMES a
 * session whose previous turn was interrupted (UI Stop, app restart) while
 * `run_in_background` tasks were still running.
 *
 * On resume the CLI first reports those dead tasks as
 * `task_notification { status: "stopped" }` ("didn't finish before the
 * previous session ended"), runs them as their own queued turn with ZERO
 * model round-trips, and writes a `result` for it:
 *
 *   { type: "result", subtype: "success", result: "", num_turns: 0,
 *     origin: { kind: "task-notification" }, (no terminal_reason) }
 *
 * Only THEN does it dequeue the user's new prompt and produce the real turn
 * (second `system/init`, assistant output, `terminal_reason: "completed"`).
 * Observed with the bundled claude-code against a live resume — see
 * `stop-retry-prelude.test.ts`.
 *
 * Treating this prelude as the turn's terminal result ends the Helmor turn
 * before the new prompt is answered and `q.close()`s the query, so the user
 * sees "The provider returned an empty response" and their message is lost.
 *
 * Narrowness: only a zero-round-trip, task-notification-origin result can
 * match. A turn that answered (or folded in) the user's prompt makes at
 * least one model round-trip, so it can never be classified stale. Callers
 * must additionally only apply this BEFORE the turn's own first result —
 * after that, a task-notification result is the background-drain
 * continuation of the user's turn and is genuinely terminal.
 */
export function isStaleResumeNotificationResult(message: SDKMessage): boolean {
	if (message.type !== "result") return false;
	const m = message as {
		origin?: { kind?: unknown };
		num_turns?: unknown;
		result?: unknown;
		terminal_reason?: unknown;
	};
	return (
		message.subtype === "success" &&
		m.origin?.kind === "task-notification" &&
		m.num_turns === 0 &&
		m.result === "" &&
		m.terminal_reason == null
	);
}
