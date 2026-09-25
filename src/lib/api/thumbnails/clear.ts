import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { writeThumbnailMap } from "$api/thumbnails/map";
import { log } from "$utils/logger";
import { THUMBNAILS_DIR } from "$utils/paths";

/** DOCS:
 * Deletes all generated thumbnails from the application's data directory.
 *
 * Removes the "thumbnails" directory and its contents under the `AppData`
 * base directory (including `map.json`), then recreates an empty thumbnail
 * map so the app stays in a consistent state. Success and errors are logged.
 *
 * @returns Resolves once the deletion attempt and map reset are complete.
 *
 * @example
 * ```ts
 * await clearThumbnails();
 * ```
 */
export const clearThumbnails = async (): Promise<void> => {
	try {
		await remove(THUMBNAILS_DIR, {
			baseDir: BaseDirectory.AppData,
			recursive: true,
		});

		// The directory (and map.json) was just removed — recreate an empty map.
		await writeThumbnailMap({});

		await log({
			level: "positive",
			callStack: new Error(),
			message: {
				context: "All thumbnails deleted successfully",
			},
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
