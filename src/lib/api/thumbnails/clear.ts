import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { updateConfig } from "$api/config/update";
import { log } from "$utils/logger";

/** DOCS:
 * Deletes all generated thumbnails from the application's data directory.
 *
 * Removes the "thumbnails" directory and its contents under the `AppData` base directory.
 * If the operation succeeds, the thumbnails configuration is cleared and a success
 * message is logged. Errors encountered during deletion are caught and logged.
 *
 * @returns Resolves once the deletion attempt and configuration update are complete.
 *
 * @example
 * ```ts
 * await clearThumbnails();
 * ```
 */
export const clearThumbnails = async (): Promise<void> => {
	try {
		const thumbnailsPath = "thumbnails";
		await remove(thumbnailsPath, {
			baseDir: BaseDirectory.AppData,
			recursive: true,
		});

		await updateConfig({ thumbnailsHashMap: {} });

		await log({
			level: "positive",
			callStack: new Error(),
			message: {
				context: "All thumbnails deleted successfully",
			}			
		});
	} catch (error) {
		await log({
			level: "error",
			message: {
				context: "Failed to delete thumbnails",
				error,
			},
			callStack: error instanceof Error ? error : new Error("Unknown error"),
		});
	}
};