import { describe, expect, it } from "vitest";
import type { ForgeDetection } from "./api";
import {
	prependGeneralPreferencePrompt,
	resolveRepoPreferencePreview,
	resolveRepoPreferencePrompt,
} from "./repo-preferences-prompts";

const GITHUB_FORGE: ForgeDetection = {
	provider: "github",
	host: "github.com",
	namespace: "acme",
	repo: "repo",
	remoteUrl: "git@github.com:acme/repo.git",
	labels: {
		providerName: "GitHub",
		cliName: "gh",
		changeRequestName: "PR",
		changeRequestFullName: "pull request",
		connectAction: "Connect GitHub",
	},
	detectionSignals: [],
};

describe("repo preference prompts", () => {
	const targetRefPlaceholder = "$" + "{TARGET_REF}";

	it("leaves the general preview empty when no override exists", () => {
		expect(resolveRepoPreferencePreview("general", {})).toBe("");
	});

	it("uses generic prose in the create-pr preview", () => {
		// Preview has no live workspace context — keep the original generic
		// wording rather than substituting placeholders into the template.
		const preview = resolveRepoPreferencePreview("createPr", {});
		expect(preview).toContain("this workspace's target branch");
		expect(preview).toContain("`gh pr create`");
		expect(preview).not.toContain("<target-branch>");
	});

	it("appends the override after the target-specific create-pr prompt", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "createPr",
				repoPreferences: { createPr: "Ship it exactly this way." },
				targetBranch: "develop",
			}),
		).toContain("### User Preferences\n\nShip it exactly this way.");
	});

	it("uses the workspace target branch in the create-pr prompt (GitHub default)", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "createPr",
				repoPreferences: {},
				targetBranch: "develop",
			}),
		).toContain(
			"Open a pull request against `develop` using `gh pr create --base develop`.",
		);
	});

	it("throws instead of falling back when create-pr has no target branch", () => {
		expect(() =>
			resolveRepoPreferencePrompt({
				key: "createPr",
				repoPreferences: {},
			}),
		).toThrow("Missing workspace target branch for createPr prompt.");
	});

	it("uses the GitHub dialect in the fix-errors prompt when forge is GitHub", () => {
		const prompt = resolveRepoPreferencePrompt({
			key: "fixErrors",
			repoPreferences: {},
			forge: GITHUB_FORGE,
		});
		expect(prompt).toContain("`gh run list` / `gh run view`");
	});

	it("renders the intent-only resolve-conflicts prompt for merge conflicts", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {},
				targetRef: "origin/main",
			}),
		).toBe(
			"Bring this branch up to date with origin/main. Resolve any conflicts. Preserve any uncommitted work. Don't push.",
		);
	});

	it("renders a narrow prompt for stash-pop conflicts", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {},
				targetRef: "origin/main",
				resolveConflictsKind: "stashPopConflict",
			}),
		).toBe(
			"Resolve the conflicts from restoring the stashed uncommitted work in this branch. Don't commit. Don't push.",
		);
	});

	it("uses the workspace target branch in the resolve-conflicts prompt", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {},
				targetBranch: "develop",
			}),
		).toContain(
			"This branch has merge conflicts with `develop`, this workspace's target branch.",
		);
	});

	it("throws instead of falling back when resolve-conflicts has no target branch", () => {
		expect(() =>
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {},
			}),
		).toThrow("Missing workspace target branch for resolveConflicts prompt.");
	});

	it("prepends the general prompt to the first user message", () => {
		expect(
			prependGeneralPreferencePrompt("Fix the failing tests.", {
				general: "Always explain the root cause first.",
			}),
		).toBe(
			"IMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.\n\n### User Preferences\n\nAlways explain the root cause first.\n\nUser request:\nFix the failing tests.",
		);
	});

	it("appends resolve-conflicts overrides after the intent-only prompt", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {
					resolveConflicts: `Prefer rebase when possible. Target: ${targetRefPlaceholder}.`,
				},
				targetRef: "origin/main",
			}),
		).toBe(
			"Bring this branch up to date with origin/main. Resolve any conflicts. Preserve any uncommitted work. Don't push.\n\nIMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.\n\n### User Preferences\n\nPrefer rebase when possible. Target: origin/main.",
		);
	});

	it("leaves the first user message unchanged when general is empty", () => {
		expect(prependGeneralPreferencePrompt("Fix the failing tests.", {})).toBe(
			"Fix the failing tests.",
		);
	});

	it("returns the review default prompt diffing against the target ref when no override is set", () => {
		const prompt = resolveRepoPreferencePrompt({
			key: "review",
			repoPreferences: {},
			targetBranch: "main",
			remote: "origin",
		});
		expect(prompt).toContain("relative to `origin/main`");
		expect(prompt).toContain("IN THIS CHAT ONLY");
		expect(prompt).toContain("git diff origin/main...HEAD");
		// Forge-agnostic — no PR machinery.
		expect(prompt).not.toContain("pull request");
		expect(prompt).not.toContain("gh pr");
		// Side-effect ban must be explicit.
		expect(prompt).toContain("Do NOT modify files");
		expect(prompt).not.toContain("### User Preferences");
	});

	it("appends review overrides after the built-in prompt", () => {
		const prompt = resolveRepoPreferencePrompt({
			key: "review",
			repoPreferences: { review: "Always check for missing tests." },
			targetBranch: "main",
			remote: "origin",
		});
		expect(prompt).toContain("git diff origin/main...HEAD");
		expect(prompt).toContain(
			"### User Preferences\n\nAlways check for missing tests.",
		);
	});

	it("is forge-agnostic — same prompt with or without forge context", () => {
		const noForgePrompt = resolveRepoPreferencePrompt({
			key: "review",
			repoPreferences: {},
			targetBranch: "main",
			remote: "origin",
		});
		const githubPrompt = resolveRepoPreferencePrompt({
			key: "review",
			repoPreferences: {},
			targetBranch: "main",
			remote: "origin",
			forge: GITHUB_FORGE,
		});
		expect(githubPrompt).toBe(noForgePrompt);
	});

	it("throws when the review prompt is built without a target branch", () => {
		expect(() =>
			resolveRepoPreferencePrompt({
				key: "review",
				repoPreferences: {},
				remote: "origin",
			}),
		).toThrow(/target branch/i);
	});

	it("uses generic prose in the review preview (no live workspace ref)", () => {
		const preview = resolveRepoPreferencePreview("review", {});
		expect(preview).toContain("relative to the target branch");
		expect(preview).toContain("IN THIS CHAT ONLY");
		expect(preview).not.toContain("origin/");
	});
});
