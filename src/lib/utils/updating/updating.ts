import type { UpdaterDependencies, UpdateSupport } from "$types/updateTypes";
import { createUpdaterController } from "./controller/controller";

export { createUpdaterController };

const browserSupport: UpdateSupport = Object.freeze({
	mode: "development",
	platform: "browser",
	architecture: "unknown",
	installer: null,
	target: null,
	reason: "browser-runtime",
});

// Native imports/work are deferred until an explicit action; construction is safe during SSR.
const nativeAdapter: UpdaterDependencies = {
	currentVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
	detectSupport: async () => {
		if (typeof window === "undefined") return browserSupport;
		const { invoke, isTauri } = await import("@tauri-apps/api/core");
		if (!isTauri()) return browserSupport;
		return invoke<UpdateSupport>("get_update_support");
	},
	check: async (options) => {
		const { check } = await import("@tauri-apps/plugin-updater");
		const { createNativeUpdateResource } = await import("./native/native");
		const update = await check(options);
		return update ? createNativeUpdateResource(update) : null;
	},
	relaunch: async () => {
		const { relaunch } = await import("@tauri-apps/plugin-process");
		await relaunch();
	},
	reportError: async ({ phase, error }) => {
		const { log } = await import("$utils/logger/logger");
		await log({
			level: "error",
			message: { context: `Updater ${phase} failed`, error },
			callStack: new Error(),
		});
	},
};

/** DOCS:
 * Application-wide updater: routes subscribe to this instance rather than recreating native state.
 * No startup check, download, install, or relaunch is performed. The native policy remains gated.
 * @example
 * ```ts
 * const state = updaterController.state;
 * await updaterController.checkForUpdates();
 * ```
 */
export const updaterController = Object.freeze(createUpdaterController(nativeAdapter));
