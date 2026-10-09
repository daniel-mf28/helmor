import { createContext, useContext } from "react";
import type { WorkspaceBranchIntent } from "./api";
import { invoke } from "./ipc";

export type ThemeMode = "system" | "light" | "dark";

export type ColorTheme =
	| "default"
	| "midnight"
	| "aurora"
	| "aubergine"
	| "hoth"
	| "ink-coral"
	| "catppuccin-latte"
	| "catppuccin-frappe"
	| "catppuccin-macchiato"
	| "catppuccin-mocha";

/** Behavior when submitting a message while the agent is still responding.
 *  - `steer`: inject into the active turn (provider-native mid-turn steer).
 *  - `queue`: stash locally; auto-fire as a new turn once the agent finishes.
 */
export type FollowUpBehavior = "steer" | "queue";

/** Controls how Claude Code returns thinking content.
 *  - `summarized`: thinking blocks contain summarized thinking text.
 *  - `omitted`: server skips streaming thinking tokens; the final text
 *    response begins streaming sooner. */
export type ClaudeThinkingDisplay = "summarized" | "omitted";
export type AppSurface = "workspace" | "workspace-start";
/** A global model preference (default / review / action). Carries its
 *  provider so a namespaced model (e.g. kimi) is never re-derived
 *  ambiguously from the bare id. `provider` is null only for legacy rows
 *  not yet re-saved. Persisted as JSON. */
export type ModelRef = { provider: string | null; modelId: string };

export type SidebarGrouping = "status" | "repo";
export type SidebarSort = "custom" | "repoName" | "updatedAt" | "createdAt";

/** Sound played alongside each desktop notification. `off` disables it. */
export type NotificationSound =
	| "off"
	| "ding"
	| "pop"
	| "chime"
	| "glass"
	| "soft"
	| "positive"
	| "doorbell"
	| "scifi"
	| "bubble"
	| "confirm"
	| "elevator"
	| "blip";

export const VALID_NOTIFICATION_SOUNDS: readonly NotificationSound[] = [
	"off",
	"ding",
	"pop",
	"chime",
	"glass",
	"soft",
	"positive",
	"doorbell",
	"scifi",
	"bubble",
	"confirm",
	"elevator",
	"blip",
];

export type ShortcutOverrides = Record<string, string | null>;

/** One Kimi model discovered via `kimi provider list`. `id` is the bare alias. */
export type KimiCachedModel = { id: string; label: string };

export type KimiProviderSettings = {
	// `null` until the first sync; `[]` means "no Kimi providers configured".
	cachedModels: KimiCachedModel[] | null;
	// `null` = show all cached in the picker; explicit list = that subset.
	enabledModelIds: string[] | null;
};

export type LocalLlmSettings = {
	enabled: boolean;
	model: string;
	autoStart: boolean;
	/** Per-catalog-entry runtime `-c` overrides. Absent key = use the
	 *  catalog default. Backend keeps this map in sync via
	 *  `setLocalLlmContextOverride`. */
	contextOverrides?: Record<string, number>;
};

/** Per-repo work mode on the start surface. `chat` is a top-level toggle
 *  (`chatModeActive`) because it doesn't belong to any repo. */
export type StartSurfaceWorkMode = "worktree" | "local";

/** Persisted preferences for the workspace-start surface. */
export type StartSurfacePreferences = {
	/** Composer submit-mode: immediate dispatch or saved draft. */
	createState: "in-progress" | "backlog";
	/** Last selected repository. */
	repoId: string | null;
	sourceBranchByRepoId: Record<string, string>;
	modeByRepoId: Record<string, StartSurfaceWorkMode>;
	branchIntentByRepoId: Record<string, WorkspaceBranchIntent>;
	/** Top-level "Just chat" toggle. Independent of the selected repo. */
	chatModeActive: boolean;
	/** Start-composer Terminal-Mode toggle. */
	terminalModeActive: boolean;
	/** Composer picks (model / effort / permission / fast) keyed by the start
	 *  context key (`start:chat`, `start:repo:<id>`). The start surface has no
	 *  session row to persist against, so without these the picks reset when
	 *  the user navigates away and the start subtree unmounts. */
	composerModelByContextKey: Record<string, ModelRef>;
	composerEffortByContextKey: Record<string, string>;
	composerPermissionModeByContextKey: Record<string, string>;
	composerFastModeByContextKey: Record<string, boolean>;
};

export type AppSettings = {
	/** Chat message body font size (px). Migrated from the legacy `fontSize`
	 *  field, which only ever affected chat rendering. */
	chatFontSize: number;
	/** Override for the sans-serif UI font stack. `null` = preset default. */
	uiFontFamily: string | null;
	/** Override for the monospace code font stack. `null` = preset default. */
	codeFontFamily: string | null;
	/** Override for embedded terminal font stack. `null` = preset default. */
	terminalFontFamily: string | null;
	/** When true, all clickable elements show a pointer cursor on hover.
	 *  When false, falls back to the default arrow. */
	usePointerCursors: boolean;
	theme: ThemeMode;
	/** Color preset applied when the effective mode is `light`. */
	lightTheme: ColorTheme;
	/** Color preset applied when the effective mode is `dark`. */
	darkTheme: ColorTheme;
	notifications: boolean;
	/** Sound effect to play with each desktop notification.
	 *  `off` keeps notifications silent. */
	notificationSound: NotificationSound;
	/** When true, hovering a terminal-like inspector tab body expands it. */
	terminalHoverExpansion: boolean;
	/** Shows the Terminal-Mode toggle in the composer; sending with it on
	 *  opens the prompt in an agent TUI instead of a GUI session. */
	enableTerminalMode: boolean;
	/** When true, skip the heads-up dialog shown before sending a conversation
	 *  with history to the terminal (new Terminal session + resume). */
	suppressTerminalResumeWarning: boolean;
	lastWorkspaceId: string | null;
	lastSessionId: string | null;
	lastSurface: AppSurface;
	defaultModel: ModelRef | null;
	/** Model used when the inspector "Review changes" helper creates a session.
	 *  When null, falls back to `defaultModel`. */
	reviewModel: ModelRef | null;
	/** Effort level for the Review helper. When null, falls back to
	 *  `defaultEffort`. */
	reviewEffort: string | null;
	/** Fast-mode flag for the Review helper. When null, falls back to
	 *  `defaultFastMode`. */
	reviewFastMode: boolean | null;
	/** Model used by simple action sessions: create/reopen PR/MR and
	 *  commit-and-push. When null, falls back to `defaultModel`. */
	prModel: ModelRef | null;
	/** Effort level for simple action sessions. When null, falls back to
	 *  `defaultEffort`. */
	prEffort: string | null;
	/** Fast-mode flag for simple action sessions. When null, falls back to
	 *  `defaultFastMode`. */
	prFastMode: boolean | null;
	defaultEffort: string | null;
	defaultFastMode: boolean;
	/** Webview zoom factor. 1.0 = 100%. Range 0.5–2.0. */
	zoomLevel: number;
	followUpBehavior: FollowUpBehavior;
	/** How Claude Code returns thinking content. Plumbed through to the
	 *  sidecar's `thinking.display` field. */
	claudeThinkingDisplay: ClaudeThinkingDisplay;
	/** Force the context-usage ring to always be visible. When false (the
	 *  default), the ring auto-hides until usage crosses
	 *  `CONTEXT_USAGE_AUTO_REVEAL_THRESHOLD`. */
	alwaysShowContextUsage: boolean;
	showUsageStats: boolean;
	/** Opt-in: when the workspace's linked PR/MR transitions to merged,
	 *  attempt to archive the workspace automatically. One-shot — runs
	 *  exactly once at the merged-edge; skipped if the workspace has an
	 *  active agent session or fails archive validation. */
	autoArchiveOnMerge: boolean;
	onboardingCompleted: boolean;
	shortcuts: ShortcutOverrides;
	/** Claude model ids in the picker. `null` = recommended official models plus
	 *  all custom models; `[]` = none. */
	claudeEnabledModelIds: string[] | null;
	/** Codex model ids in the picker. `null` = recommended official models plus
	 *  all custom models; `[]` = none. */
	codexEnabledModelIds: string[] | null;
	kimiProvider: KimiProviderSettings;
	localLlm: LocalLlmSettings;
	startSurfacePreferences: StartSurfacePreferences;
	/** Sidebar grouping mode. Persisted to localStorage (sync read on boot
	 *  to avoid the sidebar flashing the wrong grouping while SQLite-backed
	 *  settings load asynchronously). */
	sidebarGrouping: SidebarGrouping;
	/** Sidebar repository filter. Empty means all repositories. Persisted
	 *  to localStorage because it affects first-paint navigation shape. */
	sidebarRepoFilterIds: string[];
	/** Sidebar view-only sort. `custom` preserves saved drag order. */
	sidebarSort: SidebarSort;
};

export const DEFAULT_START_SURFACE_PREFERENCES: StartSurfacePreferences = {
	createState: "in-progress",
	repoId: null,
	sourceBranchByRepoId: {},
	modeByRepoId: {},
	branchIntentByRepoId: {},
	chatModeActive: false,
	terminalModeActive: false,
	composerModelByContextKey: {},
	composerEffortByContextKey: {},
	composerPermissionModeByContextKey: {},
	composerFastModeByContextKey: {},
};

/** Fallbacks for repos without a per-repo entry. */
export const START_SURFACE_MODE_FALLBACK: StartSurfaceWorkMode = "worktree";
export const START_SURFACE_BRANCH_INTENT_FALLBACK: WorkspaceBranchIntent =
	"from_branch";

/** Read a per-repo preference, falling back when missing. */
export function readRepoPreference<V>(
	record: Record<string, V>,
	repoId: string | null | undefined,
	fallback: V,
): V {
	if (!repoId) return fallback;
	return record[repoId] ?? fallback;
}

/** Immutably set a per-repo entry. */
export function writeRepoPreference<V>(
	record: Record<string, V>,
	repoId: string,
	value: V,
): Record<string, V> {
	return { ...record, [repoId]: value };
}

/**
 * Percentage of the context window above which the ring auto-reveals
 * even when `alwaysShowContextUsage` is off. Picked to match the
 * settings copy ("…only shown when more than 70% is used").
 */
export const CONTEXT_USAGE_AUTO_REVEAL_THRESHOLD = 70;

export const DEFAULT_SETTINGS: AppSettings = {
	chatFontSize: 14,
	uiFontFamily: null,
	codeFontFamily: null,
	terminalFontFamily: null,
	usePointerCursors: true,
	theme: "system",
	lightTheme: "default",
	darkTheme: "default",
	notifications: true,
	notificationSound: "off",
	terminalHoverExpansion: true,
	enableTerminalMode: false,
	suppressTerminalResumeWarning: false,
	lastWorkspaceId: null,
	lastSessionId: null,
	lastSurface: "workspace",
	defaultModel: null,
	reviewModel: null,
	reviewEffort: null,
	reviewFastMode: null,
	prModel: null,
	prEffort: null,
	prFastMode: null,
	defaultEffort: "high",
	defaultFastMode: false,
	zoomLevel: 1.0,
	followUpBehavior: "steer",
	claudeThinkingDisplay: "summarized",
	alwaysShowContextUsage: true,
	showUsageStats: true,
	autoArchiveOnMerge: false,
	onboardingCompleted: false,
	shortcuts: {},
	claudeEnabledModelIds: null,
	codexEnabledModelIds: null,
	kimiProvider: {
		cachedModels: null,
		enabledModelIds: null,
	},
	localLlm: {
		enabled: false,
		model: "",
		autoStart: true,
		contextOverrides: {},
	},
	startSurfacePreferences: DEFAULT_START_SURFACE_PREFERENCES,
	sidebarGrouping: "status",
	sidebarRepoFilterIds: [],
	sidebarSort: "custom",
};

export const THEME_STORAGE_KEY = "helmor-theme";
export const LIGHT_THEME_STORAGE_KEY = "helmor-light-theme";
export const DARK_THEME_STORAGE_KEY = "helmor-dark-theme";
export const SIDEBAR_GROUPING_STORAGE_KEY = "helmor-sidebar-grouping";
export const SIDEBAR_REPO_FILTER_STORAGE_KEY = "helmor-sidebar-repo-filter";
export const SIDEBAR_SORT_STORAGE_KEY = "helmor-sidebar-sort";
export const UI_FONT_FAMILY_STORAGE_KEY = "helmor-ui-font-family";
export const CODE_FONT_FAMILY_STORAGE_KEY = "helmor-code-font-family";
export const TERMINAL_FONT_FAMILY_STORAGE_KEY = "helmor-terminal-font-family";

/** Keys mirrored to localStorage for flash-free synchronous boot reads.
 *  Anything visible in the first paint must live here so we don't wait
 *  on the async SQLite round-trip. */
const LOCALSTORAGE_KEYS = {
	theme: THEME_STORAGE_KEY,
	lightTheme: LIGHT_THEME_STORAGE_KEY,
	darkTheme: DARK_THEME_STORAGE_KEY,
	sidebarGrouping: SIDEBAR_GROUPING_STORAGE_KEY,
	sidebarRepoFilterIds: SIDEBAR_REPO_FILTER_STORAGE_KEY,
	sidebarSort: SIDEBAR_SORT_STORAGE_KEY,
	uiFontFamily: UI_FONT_FAMILY_STORAGE_KEY,
	codeFontFamily: CODE_FONT_FAMILY_STORAGE_KEY,
	terminalFontFamily: TERMINAL_FONT_FAMILY_STORAGE_KEY,
} as const;

type LocalStorageKey = keyof typeof LOCALSTORAGE_KEYS;

const VALID_SIDEBAR_GROUPINGS: readonly SidebarGrouping[] = ["status", "repo"];
const VALID_SIDEBAR_SORTS: readonly SidebarSort[] = [
	"custom",
	"repoName",
	"updatedAt",
	"createdAt",
];

export const VALID_COLOR_THEMES: readonly ColorTheme[] = [
	"default",
	"midnight",
	"aurora",
	"aubergine",
	"hoth",
	"ink-coral",
	"catppuccin-latte",
	"catppuccin-frappe",
	"catppuccin-macchiato",
	"catppuccin-mocha",
];

// Synchronous theme read for flash-free splash boot. The full settings
// payload lives in SQLite and loads async; theme is mirrored to
// localStorage so we can paint with the right colour scheme before that
// returns.
export function getPreloadedTheme(): ThemeMode {
	if (typeof localStorage === "undefined") {
		return DEFAULT_SETTINGS.theme;
	}
	const raw = localStorage.getItem(THEME_STORAGE_KEY);
	return (raw as ThemeMode | null) ?? DEFAULT_SETTINGS.theme;
}

function readLocalStorageString(key: string): string | null {
	if (typeof localStorage === "undefined") return null;
	const v = localStorage.getItem(key);
	return v && v.length > 0 ? v : null;
}

function readColorTheme(key: string, fallback: ColorTheme): ColorTheme {
	const raw = readLocalStorageString(key);
	return VALID_COLOR_THEMES.includes(raw as ColorTheme)
		? (raw as ColorTheme)
		: fallback;
}

export function getPreloadedSettings(): AppSettings {
	const lightTheme = readColorTheme(
		LIGHT_THEME_STORAGE_KEY,
		DEFAULT_SETTINGS.lightTheme,
	);
	const darkTheme = readColorTheme(
		DARK_THEME_STORAGE_KEY,
		DEFAULT_SETTINGS.darkTheme,
	);
	const sidebarGrouping = (() => {
		const raw = readLocalStorageString(SIDEBAR_GROUPING_STORAGE_KEY);
		return VALID_SIDEBAR_GROUPINGS.includes(raw as SidebarGrouping)
			? (raw as SidebarGrouping)
			: DEFAULT_SETTINGS.sidebarGrouping;
	})();
	const sidebarSort = (() => {
		const raw = readLocalStorageString(SIDEBAR_SORT_STORAGE_KEY);
		return VALID_SIDEBAR_SORTS.includes(raw as SidebarSort)
			? (raw as SidebarSort)
			: DEFAULT_SETTINGS.sidebarSort;
	})();
	return {
		...DEFAULT_SETTINGS,
		theme: getPreloadedTheme(),
		lightTheme,
		darkTheme,
		sidebarGrouping,
		sidebarRepoFilterIds: parseSidebarRepoFilterIds(
			readLocalStorageString(SIDEBAR_REPO_FILTER_STORAGE_KEY) ?? undefined,
		),
		sidebarSort,
		uiFontFamily: readLocalStorageString(UI_FONT_FAMILY_STORAGE_KEY),
		codeFontFamily: readLocalStorageString(CODE_FONT_FAMILY_STORAGE_KEY),
		terminalFontFamily: readLocalStorageString(
			TERMINAL_FONT_FAMILY_STORAGE_KEY,
		),
	};
}

// localStorage-backed fields (sync read for flash-free boot) live in
// `LOCALSTORAGE_KEYS` above. Everything else goes through SQLite.
const SETTINGS_KEY_MAP: Record<
	Exclude<keyof AppSettings, LocalStorageKey>,
	string
> = {
	chatFontSize: "app.chat_font_size",
	usePointerCursors: "app.use_pointer_cursors",
	notifications: "app.notifications",
	notificationSound: "app.notification_sound",
	terminalHoverExpansion: "app.terminal_hover_expansion",
	enableTerminalMode: "app.enable_terminal_mode",
	suppressTerminalResumeWarning: "app.suppress_terminal_resume_warning",
	lastWorkspaceId: "app.last_workspace_id",
	lastSessionId: "app.last_session_id",
	lastSurface: "app.last_surface",
	defaultModel: "app.default_model_id",
	reviewModel: "app.review_model_id",
	reviewEffort: "app.review_effort",
	reviewFastMode: "app.review_fast_mode",
	prModel: "app.pr_model_id",
	prEffort: "app.pr_effort",
	prFastMode: "app.pr_fast_mode",
	defaultEffort: "app.default_effort",
	defaultFastMode: "app.default_fast_mode",
	zoomLevel: "app.zoom_level",
	followUpBehavior: "app.follow_up_behavior",
	claudeThinkingDisplay: "app.claude_thinking_display",
	alwaysShowContextUsage: "app.always_show_context_usage",
	showUsageStats: "app.show_usage_stats",
	autoArchiveOnMerge: "app.auto_archive_on_merge",
	onboardingCompleted: "app.onboarding_completed",
	shortcuts: "app.shortcuts",
	claudeEnabledModelIds: "app.claude_enabled_model_ids",
	codexEnabledModelIds: "app.codex_enabled_model_ids",
	kimiProvider: "app.kimi_provider",
	localLlm: "app.local_llm",
	startSurfacePreferences: "app.start_surface_preferences",
};

/** Renamed storage keys. Append-only; never reuse a string as a current key. */
export const LEGACY_SETTING_KEYS = {
	startSurfacePreferences: "app.kanban_view_state",
} as const;

/** Shim legacy keys under their current names and clear them in the DB. */
function migrateLegacySettings(
	raw: Record<string, string>,
): Record<string, string> {
	const writes: Record<string, string> = {};
	const shimmed = { ...raw };
	for (const [currentKey, legacyKey] of Object.entries(LEGACY_SETTING_KEYS)) {
		const currentValue =
			raw[SETTINGS_KEY_MAP[currentKey as keyof typeof SETTINGS_KEY_MAP]];
		const legacyValue = raw[legacyKey];
		if (currentValue !== undefined || legacyValue === undefined) continue;
		shimmed[SETTINGS_KEY_MAP[currentKey as keyof typeof SETTINGS_KEY_MAP]] =
			legacyValue;
		writes[SETTINGS_KEY_MAP[currentKey as keyof typeof SETTINGS_KEY_MAP]] =
			legacyValue;
		writes[legacyKey] = "";
	}
	if (Object.keys(writes).length > 0) {
		void invoke("update_app_settings", { settingsMap: writes }).catch(() => {});
	}
	return shimmed;
}

function parseSidebarRepoFilterIds(raw: string | undefined): string[] {
	if (!raw) return DEFAULT_SETTINGS.sidebarRepoFilterIds;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return DEFAULT_SETTINGS.sidebarRepoFilterIds;
		return Array.from(
			new Set(
				parsed.filter(
					(value): value is string =>
						typeof value === "string" && value.length > 0,
				),
			),
		);
	} catch {
		return DEFAULT_SETTINGS.sidebarRepoFilterIds;
	}
}

function parseShortcutOverrides(raw: string | undefined): ShortcutOverrides {
	if (!raw) return DEFAULT_SETTINGS.shortcuts;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return DEFAULT_SETTINGS.shortcuts;
		}
		return Object.fromEntries(
			Object.entries(parsed).filter(
				([, value]) => typeof value === "string" || value === null,
			),
		) as ShortcutOverrides;
	} catch {
		return DEFAULT_SETTINGS.shortcuts;
	}
}

function parseStringRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entry]) => key.length > 0 && typeof entry === "string" && entry,
		),
	);
}

function parseBooleanRecord(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entry]) => key.length > 0 && typeof entry === "boolean",
		),
	) as Record<string, boolean>;
}

/** Validates an already-parsed record of `ModelRef` objects, dropping
 *  malformed entries. Values are nested objects (not serialized strings), so
 *  unlike `parseModelRef` this never JSON-parses. */
function parseModelRefRecord(value: unknown): Record<string, ModelRef> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	const out: Record<string, ModelRef> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key.length === 0 || !entry || typeof entry !== "object") continue;
		const modelId = (entry as { modelId?: unknown }).modelId;
		if (typeof modelId !== "string" || !modelId.trim()) continue;
		const rawProvider = (entry as { provider?: unknown }).provider;
		const provider =
			typeof rawProvider === "string" && rawProvider.trim()
				? rawProvider.trim()
				: null;
		out[key] = { provider, modelId: modelId.trim() };
	}
	return out;
}

/** Like `parseStringRecord`, with each value constrained to `allowed`. */
function parseEnumRecord<V extends string>(
	value: unknown,
	allowed: readonly V[],
): Record<string, V> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	const allowedSet = new Set<string>(allowed);
	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entry]) =>
				key.length > 0 && typeof entry === "string" && allowedSet.has(entry),
		),
	) as Record<string, V>;
}

function parseStartSurfacePreferences(
	raw: string | undefined,
): StartSurfacePreferences {
	if (!raw) return DEFAULT_START_SURFACE_PREFERENCES;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return DEFAULT_START_SURFACE_PREFERENCES;
		}
		const o = parsed as Partial<StartSurfacePreferences> & {
			mode?: unknown;
			branchIntent?: unknown;
			chatModeActive?: unknown;
		};
		const repoId = typeof o.repoId === "string" && o.repoId ? o.repoId : null;
		// Legacy `modeByRepoId` may still contain "chat" entries from before
		// chat was promoted to a top-level toggle. Capture them so the user
		// doesn't lose the "I was in Just Chat last session" state, then
		// strip them out — modeByRepoId now only carries repo-bound modes.
		const rawModeByRepoId = parseEnumRecord(o.modeByRepoId, [
			"worktree",
			"local",
			"chat",
		] as const);
		const modeByRepoId: Record<string, StartSurfaceWorkMode> = {};
		let migratedFromLegacyChat = false;
		for (const [key, value] of Object.entries(rawModeByRepoId)) {
			if (value === "chat") {
				migratedFromLegacyChat = true;
				continue;
			}
			modeByRepoId[key] = value;
		}
		const branchIntentByRepoId = parseEnumRecord(o.branchIntentByRepoId, [
			"from_branch",
			"use_branch",
		] as const);
		if (repoId && !modeByRepoId[repoId]) {
			const legacyMode =
				o.mode === "worktree" || o.mode === "local" ? o.mode : null;
			if (legacyMode) modeByRepoId[repoId] = legacyMode;
			if (o.mode === "chat") migratedFromLegacyChat = true;
		}
		if (repoId && !branchIntentByRepoId[repoId]) {
			const legacyBranchIntent =
				o.branchIntent === "from_branch" || o.branchIntent === "use_branch"
					? o.branchIntent
					: null;
			if (legacyBranchIntent) branchIntentByRepoId[repoId] = legacyBranchIntent;
		}
		const chatModeActive =
			typeof o.chatModeActive === "boolean"
				? o.chatModeActive
				: migratedFromLegacyChat;
		return {
			createState:
				o.createState === "backlog" || o.createState === "in-progress"
					? o.createState
					: DEFAULT_START_SURFACE_PREFERENCES.createState,
			repoId,
			sourceBranchByRepoId: parseStringRecord(o.sourceBranchByRepoId),
			modeByRepoId,
			branchIntentByRepoId,
			chatModeActive,
			terminalModeActive:
				typeof o.terminalModeActive === "boolean"
					? o.terminalModeActive
					: false,
			composerModelByContextKey: parseModelRefRecord(
				o.composerModelByContextKey,
			),
			composerEffortByContextKey: parseStringRecord(
				o.composerEffortByContextKey,
			),
			composerPermissionModeByContextKey: parseStringRecord(
				o.composerPermissionModeByContextKey,
			),
			composerFastModeByContextKey: parseBooleanRecord(
				o.composerFastModeByContextKey,
			),
		};
	} catch {
		return DEFAULT_START_SURFACE_PREFERENCES;
	}
}

function parseKimiProviderSettings(
	raw: string | undefined,
): KimiProviderSettings {
	if (!raw) return DEFAULT_SETTINGS.kimiProvider;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			cachedModels: parseKimiCachedModels(parsed.cachedModels),
			enabledModelIds: parseEnabledModelIds(parsed.enabledModelIds),
		};
	} catch {
		return DEFAULT_SETTINGS.kimiProvider;
	}
}

function parseKimiCachedModels(value: unknown): KimiCachedModel[] | null {
	if (!Array.isArray(value)) return null;
	const models: KimiCachedModel[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.id !== "string") continue;
		models.push({
			id: obj.id,
			label: typeof obj.label === "string" ? obj.label : obj.id,
		});
	}
	return models;
}

function parseEnabledModelIds(value: unknown): string[] | null {
	if (value === null) return null;
	if (!Array.isArray(value)) return null;
	const ids = value.filter((item): item is string => typeof item === "string");
	return ids;
}

// Absent → null (all enabled); JSON array → that subset.
function parseEnabledModelIdsSetting(raw: string | undefined): string[] | null {
	if (!raw) return null;
	try {
		return parseEnabledModelIds(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

function parseLocalLlmSettings(raw: string | undefined): LocalLlmSettings {
	if (!raw) return DEFAULT_SETTINGS.localLlm;
	try {
		const parsed = JSON.parse(raw) as Partial<LocalLlmSettings>;
		const overrides: Record<string, number> = {};
		if (
			parsed.contextOverrides &&
			typeof parsed.contextOverrides === "object"
		) {
			for (const [key, value] of Object.entries(parsed.contextOverrides)) {
				if (typeof value === "number" && Number.isFinite(value) && value > 0) {
					overrides[key] = value;
				}
			}
		}
		return {
			enabled:
				typeof parsed.enabled === "boolean"
					? parsed.enabled
					: DEFAULT_SETTINGS.localLlm.enabled,
			model:
				typeof parsed.model === "string"
					? parsed.model
					: DEFAULT_SETTINGS.localLlm.model,
			autoStart:
				typeof parsed.autoStart === "boolean"
					? parsed.autoStart
					: DEFAULT_SETTINGS.localLlm.autoStart,
			contextOverrides: overrides,
		};
	} catch {
		return DEFAULT_SETTINGS.localLlm;
	}
}

/** Read an integer setting bounded to [min, max] with a default fallback.
 *  Used for font sizes so corrupted or out-of-range values can't render
 *  the UI unreadable. */
function readClampedInt(
	value: string | undefined,
	{ min, max, fallback }: { min: number; max: number; fallback: number },
): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

/** Parse a stored model preference. Accepts the new `{provider, modelId}` JSON
 *  form and legacy bare ids (provider unknown → null until re-saved). */
function parseModelRef(value: string | undefined): ModelRef | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const obj = JSON.parse(trimmed) as unknown;
		if (
			obj &&
			typeof obj === "object" &&
			typeof (obj as { modelId?: unknown }).modelId === "string"
		) {
			const o = obj as { provider?: unknown; modelId: string };
			const modelId = o.modelId.trim();
			if (modelId) {
				const provider =
					typeof o.provider === "string" && o.provider.trim()
						? o.provider.trim()
						: null;
				return { provider, modelId };
			}
		}
	} catch {
		// Not JSON → legacy bare id below.
	}
	return { provider: null, modelId: trimmed };
}

export async function loadSettings(): Promise<AppSettings> {
	try {
		const rawFromDb = await invoke<Record<string, string>>("get_app_settings");
		const raw = migrateLegacySettings(rawFromDb);
		const rawDefaultModelId = raw[SETTINGS_KEY_MAP.defaultModel];
		const rawReviewModelId = raw[SETTINGS_KEY_MAP.reviewModel];
		const rawReviewEffort = raw[SETTINGS_KEY_MAP.reviewEffort];
		const rawReviewFastMode = raw[SETTINGS_KEY_MAP.reviewFastMode];
		const rawPrModelId = raw[SETTINGS_KEY_MAP.prModel];
		const rawPrEffort = raw[SETTINGS_KEY_MAP.prEffort];
		const rawPrFastMode = raw[SETTINGS_KEY_MAP.prFastMode];
		// Migration: legacy `app.font_size` is the new chatFontSize. Read
		// it as a fallback when the new key is absent; the old row stays
		// in SQLite (unused) until the user next changes the chat font.
		const legacyFontSize = raw["app.font_size"];
		return {
			chatFontSize: readClampedInt(
				raw[SETTINGS_KEY_MAP.chatFontSize] ?? legacyFontSize,
				{ min: 10, max: 24, fallback: DEFAULT_SETTINGS.chatFontSize },
			),
			uiFontFamily: readLocalStorageString(UI_FONT_FAMILY_STORAGE_KEY),
			codeFontFamily: readLocalStorageString(CODE_FONT_FAMILY_STORAGE_KEY),
			terminalFontFamily: readLocalStorageString(
				TERMINAL_FONT_FAMILY_STORAGE_KEY,
			),
			usePointerCursors:
				raw[SETTINGS_KEY_MAP.usePointerCursors] !== undefined
					? raw[SETTINGS_KEY_MAP.usePointerCursors] === "true"
					: DEFAULT_SETTINGS.usePointerCursors,
			theme:
				(localStorage.getItem(THEME_STORAGE_KEY) as AppSettings["theme"]) ??
				DEFAULT_SETTINGS.theme,
			lightTheme: readColorTheme(
				LIGHT_THEME_STORAGE_KEY,
				DEFAULT_SETTINGS.lightTheme,
			),
			darkTheme: readColorTheme(
				DARK_THEME_STORAGE_KEY,
				DEFAULT_SETTINGS.darkTheme,
			),
			sidebarGrouping: (() => {
				const raw = localStorage.getItem(SIDEBAR_GROUPING_STORAGE_KEY);
				return VALID_SIDEBAR_GROUPINGS.includes(raw as SidebarGrouping)
					? (raw as SidebarGrouping)
					: DEFAULT_SETTINGS.sidebarGrouping;
			})(),
			sidebarRepoFilterIds: parseSidebarRepoFilterIds(
				localStorage.getItem(SIDEBAR_REPO_FILTER_STORAGE_KEY) ?? undefined,
			),
			sidebarSort: (() => {
				const raw = localStorage.getItem(SIDEBAR_SORT_STORAGE_KEY);
				return VALID_SIDEBAR_SORTS.includes(raw as SidebarSort)
					? (raw as SidebarSort)
					: DEFAULT_SETTINGS.sidebarSort;
			})(),
			notifications:
				raw[SETTINGS_KEY_MAP.notifications] !== undefined
					? raw[SETTINGS_KEY_MAP.notifications] === "true"
					: DEFAULT_SETTINGS.notifications,
			notificationSound: (() => {
				const v = raw[SETTINGS_KEY_MAP.notificationSound];
				return VALID_NOTIFICATION_SOUNDS.includes(v as NotificationSound)
					? (v as NotificationSound)
					: DEFAULT_SETTINGS.notificationSound;
			})(),
			terminalHoverExpansion:
				raw[SETTINGS_KEY_MAP.terminalHoverExpansion] !== undefined
					? raw[SETTINGS_KEY_MAP.terminalHoverExpansion] === "true"
					: DEFAULT_SETTINGS.terminalHoverExpansion,
			enableTerminalMode: raw[SETTINGS_KEY_MAP.enableTerminalMode] === "true",
			suppressTerminalResumeWarning:
				raw[SETTINGS_KEY_MAP.suppressTerminalResumeWarning] === "true",
			lastWorkspaceId: raw[SETTINGS_KEY_MAP.lastWorkspaceId] || null,
			lastSessionId: raw[SETTINGS_KEY_MAP.lastSessionId] || null,
			lastSurface:
				raw[SETTINGS_KEY_MAP.lastSurface] === "workspace-start"
					? "workspace-start"
					: DEFAULT_SETTINGS.lastSurface,
			defaultModel: parseModelRef(rawDefaultModelId),
			reviewModel: parseModelRef(rawReviewModelId),
			reviewEffort:
				rawReviewEffort && rawReviewEffort !== ""
					? rawReviewEffort
					: DEFAULT_SETTINGS.reviewEffort,
			reviewFastMode:
				rawReviewFastMode === "true"
					? true
					: rawReviewFastMode === "false"
						? false
						: DEFAULT_SETTINGS.reviewFastMode,
			prModel: parseModelRef(rawPrModelId),
			prEffort:
				rawPrEffort && rawPrEffort !== ""
					? rawPrEffort
					: DEFAULT_SETTINGS.prEffort,
			prFastMode:
				rawPrFastMode === "true"
					? true
					: rawPrFastMode === "false"
						? false
						: DEFAULT_SETTINGS.prFastMode,
			defaultEffort:
				raw[SETTINGS_KEY_MAP.defaultEffort] || DEFAULT_SETTINGS.defaultEffort,
			defaultFastMode:
				raw[SETTINGS_KEY_MAP.defaultFastMode] !== undefined
					? raw[SETTINGS_KEY_MAP.defaultFastMode] === "true"
					: DEFAULT_SETTINGS.defaultFastMode,
			zoomLevel: raw[SETTINGS_KEY_MAP.zoomLevel]
				? Number(raw[SETTINGS_KEY_MAP.zoomLevel])
				: DEFAULT_SETTINGS.zoomLevel,
			followUpBehavior: (() => {
				const v = raw[SETTINGS_KEY_MAP.followUpBehavior];
				return v === "queue" || v === "steer"
					? v
					: DEFAULT_SETTINGS.followUpBehavior;
			})(),
			claudeThinkingDisplay: (() => {
				const v = raw[SETTINGS_KEY_MAP.claudeThinkingDisplay];
				return v === "summarized" || v === "omitted"
					? v
					: DEFAULT_SETTINGS.claudeThinkingDisplay;
			})(),
			alwaysShowContextUsage:
				raw[SETTINGS_KEY_MAP.alwaysShowContextUsage] !== undefined
					? raw[SETTINGS_KEY_MAP.alwaysShowContextUsage] === "true"
					: DEFAULT_SETTINGS.alwaysShowContextUsage,
			showUsageStats:
				raw[SETTINGS_KEY_MAP.showUsageStats] !== undefined
					? raw[SETTINGS_KEY_MAP.showUsageStats] === "true"
					: DEFAULT_SETTINGS.showUsageStats,
			autoArchiveOnMerge:
				raw[SETTINGS_KEY_MAP.autoArchiveOnMerge] !== undefined
					? raw[SETTINGS_KEY_MAP.autoArchiveOnMerge] === "true"
					: DEFAULT_SETTINGS.autoArchiveOnMerge,
			onboardingCompleted:
				raw[SETTINGS_KEY_MAP.onboardingCompleted] !== undefined
					? raw[SETTINGS_KEY_MAP.onboardingCompleted] === "true"
					: DEFAULT_SETTINGS.onboardingCompleted,
			shortcuts: parseShortcutOverrides(raw[SETTINGS_KEY_MAP.shortcuts]),
			claudeEnabledModelIds: parseEnabledModelIdsSetting(
				raw[SETTINGS_KEY_MAP.claudeEnabledModelIds],
			),
			codexEnabledModelIds: parseEnabledModelIdsSetting(
				raw[SETTINGS_KEY_MAP.codexEnabledModelIds],
			),
			kimiProvider: parseKimiProviderSettings(
				raw[SETTINGS_KEY_MAP.kimiProvider],
			),
			localLlm: parseLocalLlmSettings(raw[SETTINGS_KEY_MAP.localLlm]),
			startSurfacePreferences: parseStartSurfacePreferences(
				raw[SETTINGS_KEY_MAP.startSurfacePreferences],
			),
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
	// localStorage-backed fields. `null` / "" clears the row so the next
	// boot falls back to the preset default.
	for (const [field, lsKey] of Object.entries(LOCALSTORAGE_KEYS) as Array<
		[LocalStorageKey, string]
	>) {
		const value = patch[field];
		if (value === undefined) continue;
		try {
			if (value === null || value === "") {
				localStorage.removeItem(lsKey);
			} else if (Array.isArray(value)) {
				if (value.length === 0) {
					localStorage.removeItem(lsKey);
				} else {
					localStorage.setItem(lsKey, JSON.stringify(value));
				}
			} else {
				localStorage.setItem(lsKey, String(value));
			}
		} catch (error) {
			console.error(`[helmor] localStorage save failed for "${lsKey}"`, error);
		}
	}

	const settings: Record<string, string> = {};
	for (const [key, dbKey] of Object.entries(SETTINGS_KEY_MAP)) {
		const value = patch[key as keyof Omit<AppSettings, LocalStorageKey>];
		if (value !== undefined) {
			const isJsonKey =
				key === "shortcuts" ||
				key === "claudeEnabledModelIds" ||
				key === "codexEnabledModelIds" ||
				key === "kimiProvider" ||
				key === "localLlm" ||
				key === "startSurfacePreferences" ||
				key === "defaultModel" ||
				key === "reviewModel" ||
				key === "prModel";
			// null clears the row (falls back to default on next boot); JSON keys
			// otherwise serialize the object, scalars stringify.
			settings[dbKey] =
				value === null ? "" : isJsonKey ? JSON.stringify(value) : String(value);
		}
	}
	if (Object.keys(settings).length === 0) return;
	try {
		await invoke("update_app_settings", { settingsMap: settings });
	} catch {
		// ignore — non-Tauri env
	}
}

export type SettingsContextValue = {
	settings: AppSettings;
	/** False while the initial load from SQLite is still in flight. */
	isLoaded: boolean;
	updateSettings: (patch: Partial<AppSettings>) => void | Promise<void>;
};

export const SettingsContext = createContext<SettingsContextValue>({
	settings: DEFAULT_SETTINGS,
	isLoaded: false,
	updateSettings: async () => {},
});

export function useSettings(): SettingsContextValue {
	return useContext(SettingsContext);
}

/** Resolve the effective theme ("light" | "dark") from a ThemeMode setting. */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
	if (mode === "system") {
		if (
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function"
		) {
			return window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}
		return "dark";
	}
	return mode;
}
