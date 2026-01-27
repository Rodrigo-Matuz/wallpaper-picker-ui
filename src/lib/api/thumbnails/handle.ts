import { basename } from "@tauri-apps/api/path";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { writable } from "svelte/store";
import { fetchConfig } from "$api/config/read";
import { updateConfig } from "$api/config/update";
import { fetchVideos } from "$api/system/fetchVideos";
import { generateThumb } from "$api/thumbnails/generate";
import type { ThumbnailRecord } from "$types/configTypes";
import { log } from "$utils/logger";
import { THUMBNAILS_DIR } from "$utils/paths";
import { sortJsonByKey } from "$utils/sortJson";

export const thumbnails = writable<ThumbnailRecord>({});
export const thumbnailsGenerated = writable(0);
export const totalVideos = writable(0);

/** DOCS:
 * Handles the generation, storage, and management of video thumbnails in the application's data directory.
 * Coordinates thumbnail generation, storage, and UI state updates.
 *
 * This function coordinates the following:
 * - Fetches configuration data to check for new wallpapers and existing thumbnails.
 * - Generates thumbnails for a list of video files if new wallpapers are detected.
 * - Reads generated thumbnail files into blob URLs for usage in the UI.
 * - Updates the thumbnails store and the application's configuration file with sorted data.
 * - Updates Svelte stores used for thumbnail display and generation progress.
 *
 * @example
 * ```ts
 * // Generate and handle thumbnails
 * await handleThumbnails();
 * console.log("Thumbnails processed successfully.");
 * ```
 */
export async function handleThumbnails(): Promise<void> {
	let { newWallpapers, thumbnailsHashMap } = await fetchConfig();
	const blobUrlsHashMap: ThumbnailRecord = {};

	if (newWallpapers) {
		try {
			const videosList = await fetchVideos();
			totalVideos.set(videosList.length);

			const newThumbnailsHashMap = await processVideoPaths(videosList);

			totalVideos.set(0); // Reset progress

			const sortedThumbnailsHashMap = sortJsonByKey(newThumbnailsHashMap);
			await updateConfig({ thumbnailsHashMap: sortedThumbnailsHashMap });
			thumbnailsHashMap = sortedThumbnailsHashMap;
		} catch (error) {
			await log({
				level: "error",
				callStack: new Error(),
				message: {
					context: "Failed to generate thumbnails",
					error,
				},
			});
		}
	} // if (newWallpapers)

	try {
		for (const [fileName, videoPath] of Object.entries(thumbnailsHashMap) as [
			string,
			string,
		][]) {
			try {
				const blobUrl: string = await fileToBlobUrl(fileName);
				blobUrlsHashMap[blobUrl] = videoPath;
			} catch (error) {
				await log({
					level: "error",
					callStack: new Error(),
					message: {
						context: "Failed to convert thumbnail file to blob URL",
						error,
					},
				});
			}
		}

		thumbnails.set(blobUrlsHashMap);
	} catch (error) {
		await log({
			level: "error",
			callStack: new Error(),
			message: {
				context: "Failed to update thumbnails store",
				error,
			},
		});
	}
}

/** DOCS:
 * Converts a thumbnail file into a blob URL for UI usage.
 *
 * Reads a file from the "thumbnails" directory and converts it into a
 * browser-compatible blob URL.
 *
 * @param fileName - Name of the thumbnail file.
 * @param directory - Base directory where the thumbnails folder is located.
 *
 * @returns Resolves with a blob URL representing the file.
 *
 * @example
 * ```ts
 * const blobUrl = await fileToBlobUrl("example.png");
 * ```
 */
async function fileToBlobUrl(
	fileName: string,
	// TODO: why not BaseDirectory.AppData instead of baseDir: directory? 
	directory: BaseDirectory = BaseDirectory.AppData,
): Promise<string> {
	const uint8Array: Uint8Array = await readFile(`${THUMBNAILS_DIR}/${fileName}`, {
		// HERE! 
		baseDir: directory,
	});
	const blob = new Blob([uint8Array], { type: "image/png" });
	return URL.createObjectURL(blob);
}

/** DOCS:
 * Processes a list of video paths to generate thumbnails and maps the resulting file names to their respective video paths.
 *
 * @param videosList - An array of absolute paths to video files.
 *
 * @returns Resolves with a record mapping thumbnail file names to video paths.
 *
 * @example
 * ```ts
 * const videoPaths = ["/path/to/video1.mp4", "/path/to/video2.mp4"];
 * const thumbnailsMap = await processVideoPaths(videoPaths);
 * console.log(thumbnailsMap);
 * ```
 */
async function processVideoPaths(videosList: string[]): Promise<ThumbnailRecord> {
	const newThumbnailsHashMap: ThumbnailRecord = {};

	for (const videoPath of videosList) {
		const thumbPath = await generateThumb(videoPath);
		const fileName = await basename(thumbPath);
		newThumbnailsHashMap[fileName] = videoPath;
		thumbnailsGenerated.update((count) => count + 1);
	}
	return newThumbnailsHashMap;
}
