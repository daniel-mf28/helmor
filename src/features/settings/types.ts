// Plain type module so callers that only need types can import without
// pulling the full settings dialog tree (Tauri commands, panels, etc.)
// into their module graph.

export type SettingsSection =
	| "general"
	| "shortcuts"
	| "appearance"
	| "model"
	| "providers"
	| "experimental"
	| "developer"
	| "account"
	| `repo:${string}`;
