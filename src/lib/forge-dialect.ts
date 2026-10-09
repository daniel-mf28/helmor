import type { ForgeDetection } from "@/lib/api";

// Forge-specific bits that get dropped into agent prompts. Everything else in
// our prompts is forge-agnostic (plain git, prose). Keep this surface tight —
// only add a field when the prompt actually needs to render it.
export type ForgePromptDialect = {
	/** Short label, e.g. "PR". */
	changeRequestName: string;
	/** Long label, e.g. "pull request". */
	changeRequestFullName: string;
	/** Forge CLI binary, e.g. "gh". */
	cliName: string;
	/** Renders the create-PR command for a given target branch. */
	createCommand: (targetBranch: string) => string;
	/** Reopen a closed PR, e.g. "gh pr reopen". */
	reopenCommand: string;
	/** Comment on a PR, e.g. "gh pr comment". */
	commentCommand: string;
	/** List CI runs, e.g. "gh run list". */
	ciListCommand: string;
	/** Inspect a CI run, e.g. "gh run view". */
	ciViewCommand: string;
	/** CI system name as it appears in prose, e.g. "CI". */
	ciSystemName: string;
	/** What the CI system calls a single run, e.g. "run". */
	ciJobNoun: string;
};

const GITHUB_DIALECT: ForgePromptDialect = {
	changeRequestName: "PR",
	changeRequestFullName: "pull request",
	cliName: "gh",
	createCommand: (branch) => `gh pr create --base ${branch}`,
	reopenCommand: "gh pr reopen",
	commentCommand: "gh pr comment",
	ciListCommand: "gh run list",
	ciViewCommand: "gh run view",
	ciSystemName: "CI",
	ciJobNoun: "run",
};

/** Prompt dialect for agent prompts. GitHub is the only supported forge;
 * the argument is kept so call sites stay forge-aware. */
export function forgePromptDialect(
	_forge?: ForgeDetection | null,
): ForgePromptDialect {
	return GITHUB_DIALECT;
}
