import { dehydrate } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ChangeRequestInfo,
	ForgeActionItem,
	ForgeActionStatus,
	ForgeDetection,
} from "./api";
import {
	changeRequestRefetchInterval,
	claudeRateLimitsQueryOptions,
	createHelmorQueryClient,
	forgeActionStatusRefetchInterval,
	helmorQueryKeys,
	PERSIST_META,
	sessionThreadMessagesQueryOptions,
	slashCommandsQueryOptions,
	workspaceForgeRefetchInterval,
} from "./query-client";

const apiMocks = vi.hoisted(() => ({
	loadSessionThreadMessages: vi.fn(async () => []),
	listSlashCommands: vi.fn(async (_input: unknown) => ({ commands: [] })),
	getClaudeRateLimits: vi.fn(
		async (_claudeConfigDir?: string | null): Promise<string | null> => null,
	),
}));

vi.mock("./api", async () => {
	const actual = await vi.importActual<typeof import("./api")>("./api");
	return {
		...actual,
		loadSessionThreadMessages: apiMocks.loadSessionThreadMessages,
		listSlashCommands: apiMocks.listSlashCommands,
		getClaudeRateLimits: apiMocks.getClaudeRateLimits,
	};
});

const OPEN_CHANGE_REQUEST: ChangeRequestInfo = {
	url: "https://github.com/acme/repo/pull/1",
	number: 1,
	state: "OPEN",
	title: "feat: thing",
	isMerged: false,
};

const MERGED_CHANGE_REQUEST: ChangeRequestInfo = {
	...OPEN_CHANGE_REQUEST,
	state: "MERGED",
	isMerged: true,
};

const CLOSED_CHANGE_REQUEST: ChangeRequestInfo = {
	...OPEN_CHANGE_REQUEST,
	state: "CLOSED",
	isMerged: false,
};

function action(
	status: ForgeActionItem["status"],
	overrides: Partial<ForgeActionItem> = {},
): ForgeActionItem {
	return {
		id: overrides.id ?? "a1",
		name: overrides.name ?? "CI",
		provider: overrides.provider ?? "github",
		status,
		...overrides,
	};
}

function actionStatus(
	overrides: Partial<ForgeActionStatus> = {},
): ForgeActionStatus {
	return {
		changeRequest: OPEN_CHANGE_REQUEST,
		reviewDecision: null,
		mergeable: "MERGEABLE",
		deployments: [],
		checks: [],
		remoteState: "ok",
		...overrides,
	};
}

function forgeDetection(
	overrides: Partial<ForgeDetection> = {},
): ForgeDetection {
	return {
		provider: "github",
		host: "github.com",
		namespace: "acme",
		repo: "repo",
		remoteUrl: "https://github.com/acme/repo.git",
		labels: {
			providerName: "GitHub",
			cliName: "gh",
			changeRequestName: "PR",
			changeRequestFullName: "pull request",
			connectAction: "Connect GitHub",
		},
		detectionSignals: [],
		...overrides,
	};
}

describe("changeRequestRefetchInterval", () => {
	it("polls every 60s when data is absent", () => {
		expect(changeRequestRefetchInterval(undefined)).toBe(60_000);
		expect(changeRequestRefetchInterval(null)).toBe(60_000);
	});

	it("polls every 60s for OPEN change requests", () => {
		expect(changeRequestRefetchInterval(OPEN_CHANGE_REQUEST)).toBe(60_000);
	});

	it("slows to 5min for MERGED change requests", () => {
		expect(changeRequestRefetchInterval(MERGED_CHANGE_REQUEST)).toBe(300_000);
	});

	it("slows to 5min when isMerged flag is set but state lags", () => {
		expect(
			changeRequestRefetchInterval({ ...OPEN_CHANGE_REQUEST, isMerged: true }),
		).toBe(300_000);
	});

	it("slows to 5min for CLOSED change requests", () => {
		expect(changeRequestRefetchInterval(CLOSED_CHANGE_REQUEST)).toBe(300_000);
	});
});

describe("forgeActionStatusRefetchInterval", () => {
	it("polls every 60s when data is absent", () => {
		expect(forgeActionStatusRefetchInterval(undefined)).toBe(60_000);
	});

	it("keeps 60s probing when remoteState is not ok", () => {
		for (const remoteState of [
			"noPr",
			"unauthenticated",
			"unavailable",
			"error",
		] as const) {
			expect(
				forgeActionStatusRefetchInterval(actionStatus({ remoteState })),
			).toBe(60_000);
		}
	});

	it("stops polling once the change request is MERGED", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ changeRequest: MERGED_CHANGE_REQUEST }),
			),
		).toBe(false);
	});

	it("stops polling once the change request is CLOSED", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ changeRequest: CLOSED_CHANGE_REQUEST }),
			),
		).toBe(false);
	});

	it("stops polling when isMerged flag is set even if state lags", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({
					changeRequest: { ...OPEN_CHANGE_REQUEST, isMerged: true },
				}),
			),
		).toBe(false);
	});

	it("polls every 5s while mergeability is UNKNOWN", () => {
		expect(
			forgeActionStatusRefetchInterval(actionStatus({ mergeable: "UNKNOWN" })),
		).toBe(5_000);
	});

	it("prefers the terminal tier over UNKNOWN mergeable (MERGED wins)", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({
					changeRequest: MERGED_CHANGE_REQUEST,
					mergeable: "UNKNOWN",
				}),
			),
		).toBe(false);
	});

	it("polls every 15s when a check is running", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ checks: [action("running")] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a check is pending", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ checks: [action("pending")] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a deployment is running", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ deployments: [action("running", { id: "d1" })] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a deployment is pending", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({ deployments: [action("pending", { id: "d1" })] }),
			),
		).toBe(15_000);
	});

	it("polls every 60s when every check and deployment is settled", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({
					checks: [action("success"), action("failure", { id: "c2" })],
					deployments: [action("success", { id: "d1" })],
				}),
			),
		).toBe(60_000);
	});

	it("prefers UNKNOWN mergeable over running checks (5s beats 15s)", () => {
		expect(
			forgeActionStatusRefetchInterval(
				actionStatus({
					mergeable: "UNKNOWN",
					checks: [action("running")],
				}),
			),
		).toBe(5_000);
	});
});

describe("workspaceForgeRefetchInterval", () => {
	it("keeps probing supported forges so CLI install state can change", () => {
		expect(workspaceForgeRefetchInterval(undefined)).toBe(60_000);
		expect(
			workspaceForgeRefetchInterval(forgeDetection({ provider: "github" })),
		).toBe(60_000);
		expect(
			workspaceForgeRefetchInterval(forgeDetection({ provider: "gitlab" })),
		).toBe(60_000);
	});

	it("stops probing unknown remotes", () => {
		expect(
			workspaceForgeRefetchInterval(forgeDetection({ provider: "unknown" })),
		).toBe(false);
	});
});

describe("sessionThreadMessagesQueryOptions — warm revisit stays IPC-free", () => {
	afterEach(() => {
		vi.useRealTimers();
		apiMocks.loadSessionThreadMessages.mockClear();
	});

	it("does not refire the thread queryFn on a warm revisit, even long after the fetch", async () => {
		vi.useFakeTimers();
		const client = createHelmorQueryClient();

		await client.fetchQuery(sessionThreadMessagesQueryOptions("session-1"));
		expect(apiMocks.loadSessionThreadMessages).toHaveBeenCalledTimes(1);

		// Well past the old 10-minute staleTime. A remount-style fetch of
		// the same options must be answered from cache — session threads
		// only go stale via explicit invalidation (sessionTurnPersisted /
		// sessionMessagesAppended events), never by clock.
		vi.advanceTimersByTime(11 * 60_000);
		await client.fetchQuery(sessionThreadMessagesQueryOptions("session-1"));
		expect(apiMocks.loadSessionThreadMessages).toHaveBeenCalledTimes(1);

		client.clear();
	});
});

describe("claudeRateLimitsQueryOptions — one cache per Claude account", () => {
	const PERSONAL = "/Users/daniel/.claude-personal";

	afterEach(() => {
		apiMocks.getClaudeRateLimits.mockClear();
	});

	it("keys the query by config dir, defaulting to the default account", () => {
		expect(claudeRateLimitsQueryOptions(true).queryKey).toEqual(
			helmorQueryKeys.claudeRateLimitsFor(null),
		);
		expect(claudeRateLimitsQueryOptions(true, null).queryKey).toEqual(
			claudeRateLimitsQueryOptions(true).queryKey,
		);
		const personal = claudeRateLimitsQueryOptions(true, PERSONAL).queryKey;
		expect(personal).toContain(PERSONAL);
		expect(personal).not.toEqual(claudeRateLimitsQueryOptions(true).queryKey);
	});

	it("keeps every account under the shared invalidation prefix", () => {
		const prefix = helmorQueryKeys.claudeRateLimits;
		expect(helmorQueryKeys.claudeRateLimitsFor(null).slice(0, 1)).toEqual(
			prefix,
		);
		expect(helmorQueryKeys.claudeRateLimitsFor(PERSONAL).slice(0, 1)).toEqual(
			prefix,
		);
	});

	it("fetches and caches each account separately", async () => {
		apiMocks.getClaudeRateLimits.mockImplementation(async (dir) =>
			dir ? "personal" : "work",
		);
		const client = createHelmorQueryClient();

		expect(await client.fetchQuery(claudeRateLimitsQueryOptions(true))).toBe(
			"work",
		);
		expect(
			await client.fetchQuery(claudeRateLimitsQueryOptions(true, PERSONAL)),
		).toBe("personal");
		expect(apiMocks.getClaudeRateLimits).toHaveBeenNthCalledWith(1, null);
		expect(apiMocks.getClaudeRateLimits).toHaveBeenNthCalledWith(2, PERSONAL);
		expect(client.getQueryData(helmorQueryKeys.claudeRateLimitsFor(null))).toBe(
			"work",
		);
		expect(
			client.getQueryData(helmorQueryKeys.claudeRateLimitsFor(PERSONAL)),
		).toBe("personal");

		client.clear();
	});
});

describe("createHelmorQueryClient dehydrate filter", () => {
	it("only persists queries that opt in via meta.persist", () => {
		const client = createHelmorQueryClient();
		// Two queries explicitly opted in.
		client
			.getQueryCache()
			.build(client, {
				queryKey: ["workspaceGroups"],
				queryFn: async () => [{ id: "g1" }],
				meta: PERSIST_META,
			})
			.setData([{ id: "g1" }]);
		client
			.getQueryCache()
			.build(client, {
				queryKey: ["workspaceForge", "ws-1"],
				queryFn: async () => ({ provider: "github" }),
				meta: PERSIST_META,
			})
			.setData({ provider: "github" });
		// Two without meta — must be excluded.
		client.setQueryData(["workspaceFiles", "/path"], [{ name: "a.ts" }]);
		client.setQueryData(["sessionMessages", "s1", "thread"], []);

		const dumped = dehydrate(client);
		const roots = dumped.queries.map((q) => q.queryKey[0]).sort();
		expect(roots).toEqual(["workspaceForge", "workspaceGroups"]);
	});

	it("skips pending queries even when meta.persist is set", () => {
		const client = createHelmorQueryClient();
		// A query that's never been fulfilled stays in `pending` state; the
		// default hydration contract drops those, and our override must too.
		client.getQueryCache().build(client, {
			queryKey: ["workspaceGroups"],
			queryFn: () => new Promise(() => {}),
			meta: PERSIST_META,
		});

		const dumped = dehydrate(client);
		expect(dumped.queries).toHaveLength(0);
	});

	it("ignores meta values that are not the literal `{ persist: true }`", () => {
		const client = createHelmorQueryClient();
		// `meta: {}` and absent meta both fall through.
		client
			.getQueryCache()
			.build(client, {
				queryKey: ["workspaceGroups"],
				queryFn: async () => [],
				meta: {},
			})
			.setData([]);
		client.setQueryData(["repositories"], []);

		const dumped = dehydrate(client);
		expect(dumped.queries).toHaveLength(0);
	});
});

describe("slash command query keys", () => {
	it("gives each Claude account its own key", () => {
		const args = ["claude", "/repo", "repo-1", "ws-1"] as const;
		const defaultKey = slashCommandsQueryOptions(...args).queryKey;
		const workKey = slashCommandsQueryOptions(
			...args,
			"/Users/me/.claude-work",
		).queryKey;
		const personalKey = slashCommandsQueryOptions(
			...args,
			"/Users/me/.claude-personal",
		).queryKey;
		expect(workKey).not.toEqual(defaultKey);
		expect(workKey).not.toEqual(personalKey);
		// Omitted and null both mean the default account.
		expect(slashCommandsQueryOptions(...args, null).queryKey).toEqual(
			defaultKey,
		);
	});

	it("keeps the workspace id at index 3 for invalidation", () => {
		const key = helmorQueryKeys.slashCommands(
			"claude",
			"/repo",
			"ws-1",
			"repo-1",
			"/Users/me/.claude-work",
		);
		expect(key[0]).toBe("slashCommands");
		expect(key[3]).toBe("ws-1");
	});

	it("sends the account to the backend", async () => {
		apiMocks.listSlashCommands.mockClear();
		const options = slashCommandsQueryOptions(
			"claude",
			"/repo",
			"repo-1",
			"ws-1",
			"/Users/me/.claude-work",
		);
		const queryFn = options.queryFn as () => Promise<unknown>;
		await queryFn();
		expect(apiMocks.listSlashCommands).toHaveBeenCalledWith({
			provider: "claude",
			workingDirectory: "/repo",
			repoId: "repo-1",
			workspaceId: "ws-1",
			claudeConfigDir: "/Users/me/.claude-work",
		});
	});
});
