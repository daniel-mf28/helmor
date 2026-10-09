import { describe, expect, it } from "vitest";
import type { ForgeDetection } from "./api";
import {
	buildCommitButtonPrompt,
	usesActionModelOverride,
} from "./commit-button-prompts";

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

describe("buildCommitButtonPrompt", () => {
	it("uses the action model only for simple bounded action sessions", () => {
		expect(usesActionModelOverride("create-pr")).toBe(true);
		expect(usesActionModelOverride("commit-and-push")).toBe(true);
		expect(usesActionModelOverride("open-pr")).toBe(true);
		expect(usesActionModelOverride("fix")).toBe(false);
		expect(usesActionModelOverride("resolve-conflicts")).toBe(false);
		expect(usesActionModelOverride("push")).toBe(false);
	});

	it("appends create-pr preferences after the built-in prompt", () => {
		expect(
			buildCommitButtonPrompt(
				"create-pr",
				{
					createPr: "Always include rollout notes.",
				},
				"release/next",
			),
		).toContain("### User Preferences\n\nAlways include rollout notes.");
	});

	it("passes the target branch into create-pr prompts (GitHub default)", () => {
		expect(buildCommitButtonPrompt("create-pr", {}, "release/next")).toContain(
			"gh pr create --base release/next",
		);
	});

	it("passes the target branch into create-pr prompts (GitHub forge)", () => {
		const prompt = buildCommitButtonPrompt(
			"create-pr",
			{},
			"release/next",
			GITHUB_FORGE,
		);
		expect(prompt).toContain("Create a pull request");
		expect(prompt).toContain(
			"Open a pull request against `release/next` using `gh pr create --base release/next`.",
		);
	});

	it("passes the target branch into resolve-conflicts prompts", () => {
		expect(
			buildCommitButtonPrompt("resolve-conflicts", {}, "release/next"),
		).toContain(
			"This branch has merge conflicts with `release/next`, this workspace's target branch.",
		);
	});

	it("appends fix-errors preferences after the built-in prompt", () => {
		expect(
			buildCommitButtonPrompt("fix", {
				fixErrors: "Run targeted tests before broad suites.",
			}),
		).toContain(
			"### User Preferences\n\nRun targeted tests before broad suites.",
		);
	});

	it("uses GitHub CI inspection commands by default", () => {
		const prompt = buildCommitButtonPrompt("fix", null);
		expect(prompt).toContain("`gh run list` / `gh run view`");
	});

	it("uses the same root-cause guidance with or without forge context", () => {
		const defaultPrompt = buildCommitButtonPrompt("fix", null);
		const githubPrompt = buildCommitButtonPrompt(
			"fix",
			null,
			null,
			GITHUB_FORGE,
		);
		const clause = "— don't just paper over the symptom";
		expect(defaultPrompt).toContain(clause);
		expect(githubPrompt).toContain(clause);
	});

	it("uses GitHub reopen commands for open-pr by default", () => {
		const prompt = buildCommitButtonPrompt("open-pr", null);
		expect(prompt).toContain("Reopen the closed pull request");
		expect(prompt).toContain("`gh pr reopen` + `gh pr comment`");
	});

	it("uses pure-git instructions for commit-and-push regardless of forge", () => {
		const githubPrompt = buildCommitButtonPrompt(
			"commit-and-push",
			null,
			null,
			GITHUB_FORGE,
			"origin",
		);
		const noForgePrompt = buildCommitButtonPrompt(
			"commit-and-push",
			null,
			null,
			null,
			"origin",
		);
		expect(githubPrompt).toBe(noForgePrompt);
		expect(githubPrompt).toContain("Commit and push all uncommitted work");
	});

	it("substitutes the workspace remote into the commit-and-push prompt", () => {
		const prompt = buildCommitButtonPrompt(
			"commit-and-push",
			null,
			null,
			null,
			"upstream",
		);
		expect(prompt).toContain("Push the current branch to `upstream`.");
		expect(prompt).toContain("`git push -u upstream HEAD`");
		expect(prompt).not.toContain("<remote>");
	});

	it("emits a commit-only prompt (no push) when the workspace has no remote", () => {
		const prompt = buildCommitButtonPrompt("commit-and-push", null, null);
		expect(prompt).toContain("Commit all uncommitted work");
		expect(prompt).toContain("This repository has no remote");
		expect(prompt).not.toContain("git push");
		expect(prompt).not.toContain("<remote>");
	});

	it("substitutes the workspace remote into the create-pr prompt", () => {
		const prompt = buildCommitButtonPrompt(
			"create-pr",
			{},
			"release/next",
			GITHUB_FORGE,
			"upstream",
		);
		expect(prompt).toContain("Push the current branch to `upstream`.");
		expect(prompt).toContain("`git push -u upstream HEAD`");
		expect(prompt).not.toContain("<remote>");
	});

	it("diffs against the target ref and stays chat-only by default", () => {
		const prompt = buildCommitButtonPrompt(
			"review",
			null,
			"main",
			null,
			"origin",
		);
		expect(prompt).toContain("relative to `origin/main`");
		expect(prompt).toContain("git diff origin/main...HEAD");
		expect(prompt).toContain("IN THIS CHAT ONLY");
		expect(prompt).toContain("Do NOT modify files");
		// Forge-agnostic — never touches gh.
		expect(prompt).not.toContain("pull request");
		expect(prompt).not.toContain("gh pr");
	});

	it("produces the same review prompt regardless of forge context", () => {
		const noForgePrompt = buildCommitButtonPrompt(
			"review",
			null,
			"main",
			null,
			"origin",
		);
		const githubPrompt = buildCommitButtonPrompt(
			"review",
			null,
			"main",
			GITHUB_FORGE,
			"origin",
		);
		expect(githubPrompt).toBe(noForgePrompt);
	});

	it("appends review preferences after the built-in prompt", () => {
		expect(
			buildCommitButtonPrompt(
				"review",
				{ review: "Focus on security regressions." },
				"main",
				null,
				"origin",
			),
		).toContain("### User Preferences\n\nFocus on security regressions.");
	});
});
