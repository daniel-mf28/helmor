import { useSyncExternalStore } from "react";

// `file-extension-icon-js` is CommonJS and bundles ~4 MB of SVG strings, so it
// is loaded with a dynamic `import()` instead of sitting in the eager chunk.
// Until it resolves, callers get a small generic icon; once it lands every
// component that called `useFileIconsReady()` re-renders with the real ones.

type IconModule = typeof import("file-extension-icon-js");

const svgDataUri = (svg: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const GENERIC_FILE_ICON = svgDataUri(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
);
const GENERIC_FOLDER_ICON = svgDataUri(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
);

let iconModule: IconModule | null = null;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Starts (once) the dynamic import. Safe to call repeatedly. */
export function preloadFileIcons(): Promise<void> {
	loadPromise ??= import("file-extension-icon-js")
		.then((mod) => {
			iconModule = mod;
			for (const listener of listeners) listener();
		})
		.catch(() => {
			// Keep the generic fallback; allow a later retry.
			loadPromise = null;
		});
	return loadPromise;
}

/** Warm the chunk once the browser is idle so rows rarely see the fallback. */
export function preloadFileIconsWhenIdle() {
	if (typeof window === "undefined") return;
	if (typeof window.requestIdleCallback === "function") {
		window.requestIdleCallback(() => void preloadFileIcons(), {
			timeout: 3000,
		});
	} else {
		window.setTimeout(() => void preloadFileIcons(), 1500);
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	// First consumer kicks the load off even if the idle preload hasn't run.
	void preloadFileIcons();
	return () => {
		listeners.delete(listener);
	};
}

const getSnapshot = () => iconModule !== null;

export const areFileIconsLoaded = getSnapshot;

/** Re-renders the caller once the icon package has loaded. Returns ready. */
export function useFileIconsReady(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getFileIconSrc(name: string): string {
	return iconModule ? iconModule.getMaterialFileIcon(name) : GENERIC_FILE_ICON;
}

export function getFolderIconSrc(name: string, open?: boolean): string {
	return iconModule
		? iconModule.getMaterialFolderIcon(name, open || undefined)
		: GENERIC_FOLDER_ICON;
}
