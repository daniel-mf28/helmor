import { describe, expect, it } from "vitest";
import type { AgentModelSection } from "@/lib/api";
import { resolveSessionSelectedModelId } from "@/lib/workspace-helpers";
import {
	includeLocalModel,
	includePinnedHiddenModel,
} from "./session-model-sections";

const SECTIONS: AgentModelSection[] = [
	{
		id: "codex",
		label: "Codex",
		status: "ready",
		options: [
			{
				id: "gpt-5.6-sol",
				provider: "codex",
				label: "GPT-5.6 Sol",
				cliModel: "gpt-5.6-sol",
			},
		],
	},
];

describe("includePinnedHiddenModel", () => {
	it("keeps the hidden model available to an existing Codex session", () => {
		const result = includePinnedHiddenModel(SECTIONS, {
			agentType: "codex",
			model: "gpt-5.5",
		});

		expect(result[0]?.options.map((model) => model.id)).toEqual([
			"gpt-5.6-sol",
			"gpt-5.5",
		]);
	});

	it("keeps a hidden Opus model available to an existing Claude session", () => {
		const result = includePinnedHiddenModel([], {
			agentType: "claude",
			model: "claude-opus-4-7[1m]",
		});

		expect(result[0]).toEqual(
			expect.objectContaining({
				id: "claude",
				options: [expect.objectContaining({ id: "claude-opus-4-7[1m]" })],
			}),
		);
	});

	// Opus 5 took 4.8's place in the default set, so 4.8 became hidden-by-
	// default. Without an entry here, a session pinned to it would have its
	// persisted pick dropped as a dangling id and get silently switched to the
	// default model (see `resolveSessionSelectedModelId`).
	it("keeps Opus 4.8 available to a session still pinned to it", () => {
		const result = includePinnedHiddenModel([], {
			agentType: "claude",
			model: "claude-opus-4-8[1m]",
		});

		expect(result[0]).toEqual(
			expect.objectContaining({
				id: "claude",
				options: [
					expect.objectContaining({
						id: "claude-opus-4-8[1m]",
						label: "Opus 4.8 1M",
						supportsFastMode: true,
					}),
				],
			}),
		);
	});

	it("does not add a legacy model to unrelated sessions", () => {
		expect(
			includePinnedHiddenModel(SECTIONS, {
				agentType: "claude",
				model: "gpt-5.5",
			}),
		).toBe(SECTIONS);
	});

	it("does not duplicate a legacy model that the user re-enabled", () => {
		const withLegacy = [
			{
				...SECTIONS[0]!,
				options: [
					...SECTIONS[0]!.options,
					{
						id: "gpt-5.5",
						provider: "codex" as const,
						label: "GPT-5.5",
						cliModel: "gpt-5.5",
					},
				],
			},
		];

		expect(
			includePinnedHiddenModel(withLegacy, {
				agentType: "codex",
				model: "gpt-5.5",
			}),
		).toBe(withLegacy);
	});
});

// Regression: a local session or pick must never silently fall back to a cloud
// model when the catalog stops listing the local model (Local LLM turned off,
// model file removed, catalog still loading).
describe("includeLocalModel", () => {
	const localIds = (sections: AgentModelSection[]) =>
		sections.flatMap((s) => s.options).filter((o) => o.id === "helmor-local");

	it("keeps the local option for a session pinned to it", () => {
		const result = includeLocalModel(SECTIONS, { model: "helmor-local" });
		expect(localIds(result)).toHaveLength(1);
		expect(localIds(result)[0].provider).toBe("claude");
	});

	it("keeps the local option for an unsent local pick", () => {
		const result = includeLocalModel(SECTIONS, null, {
			modelId: "helmor-local",
		});
		expect(localIds(result)).toHaveLength(1);
	});

	it("keeps it while the catalog is still empty", () => {
		const result = includeLocalModel([], { model: "helmor-local" });
		expect(localIds(result)).toHaveLength(1);
	});

	it("doesn't duplicate a listed local option", () => {
		const listed = includeLocalModel(SECTIONS, { model: "helmor-local" });
		expect(
			localIds(includeLocalModel(listed, { model: "helmor-local" })),
		).toHaveLength(1);
	});

	it("leaves cloud sessions untouched", () => {
		expect(includeLocalModel(SECTIONS, { model: "gpt-5.6-sol" })).toBe(
			SECTIONS,
		);
	});

	it("never resolves a local pick to a cloud default", () => {
		const sections = includeLocalModel(SECTIONS, null, {
			modelId: "helmor-local",
		});
		const selected = resolveSessionSelectedModelId({
			session: null,
			modelSelections: {
				ctx: { provider: "claude", modelId: "helmor-local" },
			},
			modelSections: SECTIONS,
			settingsDefaultModel: { provider: "codex", modelId: "gpt-5.6-sol" },
			contextKey: "ctx",
		});
		expect(selected?.modelId).toBe("helmor-local");
		expect(localIds(sections)).toHaveLength(1);
	});
});
