import { describe, expect, test } from "bun:test";
import { listProviderModels, pickFastestCodexModel } from "./model-catalog.js";

describe("Codex model catalog", () => {
	test("lists the GPT-6 and GPT-5.6 families with its runtime effort levels", () => {
		const models = listProviderModels("codex");

		expect(models.slice(0, 6).map((model) => model.id)).toEqual([
			"gpt-6-sol",
			"gpt-6-astra",
			"gpt-6-luna",
			"gpt-5.6-sol",
			"gpt-5.6-terra",
			"gpt-5.6-luna",
		]);
		// GPT-6 Sol leads; Astra and both Lunas have no `ultra` tier.
		const six = ["low", "medium", "high", "xhigh", "max", "ultra"];
		const five = ["low", "medium", "high", "xhigh", "max"];
		expect(models.slice(0, 6).map((model) => model.effortLevels)).toEqual([
			six,
			five,
			five,
			six,
			six,
			five,
		]);
	});

	test("uses GPT-5.6 Luna for lightweight background work", () => {
		expect(pickFastestCodexModel()).toBe("gpt-5.6-luna");
	});
});
