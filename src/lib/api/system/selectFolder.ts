import { open } from "@tauri-apps/plugin-dialog";
import { get } from "svelte/store";
import { updateConfig } from "$api/config/update";
import { t } from "$lang/index";
import { log } from "$utils/logger";

/** DOCS:
 * Opens a native folder selection dialog (Tauri dialog plugin), logs the operation,
 * and updates the configuration with the selected folder path.
 *
 * Replaces the previous zenity (unix) / rfd (windows) shell-out with the
 * official plugin, which uses the platform's native dialog on all systems.
 *
 * @returns {Promise<string>} Resolves to the selected folder path, or an empty string
 *          when the dialog is cancelled or an error occurs.
 *
 * @example
 * ```ts
 * const folderPath = await selectFolder();
 * if (folderPath) await handleThumbnails(true);
 * ```
 */
export async function selectFolder(): Promise<string> {
	try {
		const selected = await open({
			directory: true,
			title: get(t)("homeFolderDialogTitle"),
		});

		const folderPath = typeof selected === "string" ? selected : "";

		if (folderPath) {
			await log({
				level: "positive",
				callStack: new Error(),
				message: {
					context: "Folder selected successfully",
					path: folderPath,
				},
			});

			await updateConfig({
				wallpapersPath: folderPath,
			});
		}

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
