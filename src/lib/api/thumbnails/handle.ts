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

let isProcessing = false;
let pendingPromise: Promise<void> | null = null;

/** DOCS:
 * Handles the generation, storage, and management of video thumbnails in the application's data directory.
 * Coordinates thumbnail generation, blob loading, configuration updates, and UI state synchronization.
 *
 * This function is concurrency-safe:
 * - If a thumbnail generation process is already running, subsequent calls will wait for the
 *   current execution to finish instead of running in parallel.
 *
 * Main responsibilities:
 * - Fetches configuration data to determine whether new wallpapers were added.
 * - Optionally forces thumbnail regeneration regardless of config state.
 * - Generates thumbnails for all detected video files when needed.
 * - Updates progress-related Svelte stores during generation.
 * - Sorts and persists the generated thumbnail mapping into the configuration file.
 * - Converts thumbnail files into blob URLs for UI consumption.
 * - Updates the thumbnails store used by the UI.
 *
 * Error handling:
 * - Errors during generation, blob loading, or store updates are logged individually
 *   without crashing the entire pipeline.
 *
 * @param forceRegenerate - When true, forces thumbnail regeneration even if no new wallpapers
 * are detected (e.g. after deletions).
 *
 * @example
 * ```ts
 * // Normal execution (uses config state)
 * await handleThumbnails();
 *
 * // Force regeneration (ignores config state)
 * await handleThumbnails(true);
 * ```
 */
export async function handleThumbnails(forceRegenerate = false): Promise<void> {
	if (isProcessing) {
			if (pendingPromise) await pendingPromise;
			return;
		}

    isProcessing = true;
    pendingPromise = (async () => {
        try {
            let { newWallpapers, thumbnailsHashMap } = await fetchConfig();

            if (forceRegenerate) newWallpapers = true;

            const blobUrlsHashMap: ThumbnailRecord = {};

            if (newWallpapers) {
                try {
                    thumbnailsGenerated.set(0);
                    const videosList = await fetchVideos();
                    totalVideos.set(videosList.length);

                    const newThumbnailsHashMap = await processVideoPaths(videosList);

                    totalVideos.set(0);

                    const sorted = sortJsonByKey(newThumbnailsHashMap);
                    await updateConfig({ thumbnailsHashMap: sorted });
                    thumbnailsHashMap = sorted;
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
            }

            try {
                for (const [fileName, videoPath] of Object.entries(thumbnailsHashMap) as [string, string][]) {
                    try {
                        const blobUrl = await fileToBlobUrl(fileName);
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
        } finally {
            isProcessing = false;
            pendingPromise = null;
        }
    })();

    await pendingPromise;
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
		await new Promise((r) => setTimeout(r, 150));
		const fileName = await basename(thumbPath);
		newThumbnailsHashMap[fileName] = videoPath;
		thumbnailsGenerated.update((count) => count + 1);
	}
	return newThumbnailsHashMap;
}
