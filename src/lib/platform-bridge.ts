/**
 * Thin wrappers for desktop Tauri plugin APIs, so callers share one import
 * point (and tests can mock a single module).
 */

import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

/** Open a URL externally via the OS (opener plugin). */
export async function openUrl(url: string, openWith?: string): Promise<void> {
	// Preserve call arity so `expect(openUrl).toHaveBeenCalledWith(url)` (no
	// trailing `undefined`) keeps matching.
	if (openWith !== undefined) {
		await tauriOpenUrl(url, openWith);
		return;
	}
	await tauriOpenUrl(url);
}
