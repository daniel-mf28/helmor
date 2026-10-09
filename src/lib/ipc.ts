/**
 * Single import point for the backend IPC primitives (`invoke` / `Channel` /
 * `listen` / `convertFileSrc`). These are the real Tauri primitives; the test
 * suite mocks `@tauri-apps/api/*` and the mocks flow through unchanged.
 */

export {
	Channel,
	convertFileSrc,
	invoke,
} from "@tauri-apps/api/core";
export { listen, type UnlistenFn } from "@tauri-apps/api/event";
