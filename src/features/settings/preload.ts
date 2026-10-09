// Single dynamic-import entry for the settings dialog chunk. Shared by the
// `React.lazy` wrapper and by hover / idle preloaders so the module is
// fetched once and the lazy boundary resolves instantly when opened.

let settingsModule: Promise<typeof import("./index")> | null = null;

export function loadSettingsModule() {
	settingsModule ??= import("./index");
	return settingsModule;
}

/** Fire-and-forget warm-up; never throws. */
export function preloadSettings() {
	void loadSettingsModule().catch(() => {
		settingsModule = null;
	});
}
