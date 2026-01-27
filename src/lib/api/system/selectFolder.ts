import { invoke } from "@tauri-apps/api/core";
import { updateConfig } from "$api/config/update";
import { log } from "$utils/logger";

/** DOCS:
 * Selects a folder using the backend folder selection mechanism, logs the operation,
 * and updates the configuration with the selected folder path.
 *
 * This function interacts with the backend via the `select_folder` command to allow
 * the user to select a folder. The selected folder path is logged upon success, and
 * the application's configuration is updated with this path. If an error occurs during
 * the process, it logs the error and returns an empty string.
 *
 * @returns {Promise<string>} Resolves to the selected folder path. If an error occurs, resolves to an empty string.
 *
 * @example
 * ```ts
 * // Example usage of selectFolder
 * const folderPath = await selectFolder();
 * ```
 */
export async function selectFolder(): Promise<string> {
	try {
		const folderPath: string = await invoke("select_folder");

		await log({
			level: "positive",
			callStack: new Error(),
			message: {
				context: "Folder selected successfully",
			},
		});

		await updateConfig({
			wallpapersPath: folderPath,
		});

		return folderPath;
	} catch (error) {
		await log({
			level: "error",
			callStack: new Error(),
			message: {
				context: "Failed to select folder",
				error,
			},
		});

		return "";
	}
}