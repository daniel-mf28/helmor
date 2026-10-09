import { useEffect, useRef } from "react";
import { detectClaudeConfigDirs } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { isQuickPanelWindow } from "@/lib/window-role";

/** First-run helper: once, add any existing `~/.claude-*` config folders
 *  (e.g. `~/.claude-personal`) as Claude accounts. Renders nothing. A flag in
 *  settings keeps it from re-adding accounts the user later removes. */
export function ClaudeAccountsSeeder() {
	const { settings, isLoaded, updateSettings } = useSettings();
	const started = useRef(false);

	useEffect(() => {
		// The quick-panel window shares settings; only the main window seeds.
		if (!isLoaded || settings.claudeAccountsSeeded || isQuickPanelWindow)
			return;
		if (started.current) return;
		started.current = true;
		void (async () => {
			try {
				const found = await detectClaudeConfigDirs();
				const known = new Set(settings.claudeAccounts.map((a) => a.configDir));
				const fresh = found.filter((item) => !known.has(item.configDir));
				await updateSettings({
					claudeAccounts: [
						...settings.claudeAccounts,
						...fresh.map((item) => ({
							id: crypto.randomUUID().slice(0, 8),
							label: item.label,
							configDir: item.configDir,
						})),
					],
					claudeAccountsSeeded: true,
				});
			} catch {
				// Detection failed (non-Tauri env); retry next launch.
				started.current = false;
			}
		})();
	}, [
		isLoaded,
		settings.claudeAccountsSeeded,
		settings.claudeAccounts,
		updateSettings,
	]);

	return null;
}
