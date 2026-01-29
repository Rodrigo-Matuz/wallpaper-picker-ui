import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { UpdateState } from "$types/updateTypes";

/**
 * Current state of the update process.
 * @remarks Updated by `checkForUpdates()` and `installUpdate()`
 */
let updateInfo: Update | null = null;

/**
 * Current FSM-like state of the updater.
 * @remarks Exposed via `getUpdateState()`
 */
let state: UpdateState = "idle";

/**
 * Last error that occurred during update check or installation.
 * @remarks Cleared on each new operation
 */
let error: Error | null = null;

/** DOCS:
 * Returns the current update status, including state, available update (if any),
 * and the last error (if any).
 *
 * This is the primary way the UI should read update progress / availability.
 *
 * @returns Object containing the current updater state machine value,
 *          the `Update` object (when available), and any error.
 *
 * @example
 * ```ts
 * const status = getUpdateState();
 * if (status.state === "available") {
 *   console.log(`Update v${status.update?.version} is ready`);
 * } else if (status.state === "error") {
 *   console.error("Update failed:", status.error?.message);
 * }
 * ```
 */
export function getUpdateState() {
	return {
		state,
		update: updateInfo,
		error,
	} as const;
}

/** DOCS:
 * Checks for available updates **once** and updates the internal state.
 *
 * Should be called once during application startup (e.g. in an `onMount` handler
 * or after the main window is created).
 *
 * - Skips execution if already busy (`state !== "idle"`)
 * - Sets appropriate transitional states: `"checking" → "available"` or `"idle"`
 * - Captures and stores any error in case of network/permissions issues
 *
 * Does **not** download or install anything — only performs metadata check.
 *
 * @returns Promise that resolves when the check completes (success or failure)
 *
 * @example
 * ```ts
 * // In main.svelte or App initialization
 * onMount(async () => {
 *   await checkForUpdates();
 *   const { state } = getUpdateState();
 *   if (state === "available") {
 *     showUpdateAvailableDialog();
 *   }
 * });
 * ```
 */
export async function checkForUpdates(): Promise<void> {
	if (state !== "idle") return;

	state = "checking";
	error = null;

	try {
		const update = await check();

		if (update) {
			updateInfo = update;
			state = "available";
		} else {
			state = "idle";
		}
	} catch (err) {
		state = "error";
		error = err instanceof Error ? err : new Error(String(err));
	}
}

/** DOCS:
 * Downloads and installs the pending update, then restarts the application.
 *
 * Must only be called when `getUpdateState().state === "available"`.
 *
 * Flow:
 * 1. Marks state as `"downloading"`
 * 2. Downloads + installs the update using Tauri updater plugin
 * 3. Sets state to `"restarting"`
 * 4. Triggers application relaunch
 *
 * If any step fails, captures the error and sets state to `"error"`.
 *
 * @throws Nothing — errors are caught and stored in `error` instead
 * @returns Promise that resolves only if relaunch is reached
 *          (in practice, the app restarts before resolution)
 *
 * @example
 * ```ts
 * // In update available dialog "Install Now" button handler
 * async function onInstallClick() {
 *   try {
 *     await installUpdate();
 *     // Code here is usually never reached because relaunch() happens
 *   } catch {
 *     // Not needed — error is already in getUpdateState().error
 *   }
 * }
 * ```
 */
export async function installUpdate(): Promise<void> {
	if (!updateInfo || state !== "available") return;

	state = "downloading";
	error = null;

	try {
		await updateInfo.downloadAndInstall();
		state = "restarting";
		await relaunch();
	} catch (err) {
		state = "error";
		error = err instanceof Error ? err : new Error(String(err));
	}
}