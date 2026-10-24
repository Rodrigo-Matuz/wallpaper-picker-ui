import { invoke } from "@tauri-apps/api/core";
import { basename } from "@tauri-apps/api/path";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { get, writable } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { fetchVideos } from "$api/system/fetchVideos/fetchVideos";
import { generateThumb } from "$api/thumbnails/generate/generate";
import {
	migrateThumbnailMapFromConfig,
	readThumbnailMap,
	writeThumbnailMap,
} from "$api/thumbnails/map/map";
import { withThumbnailOperation } from "$api/thumbnails/mutex";
import { t } from "$lang/index";
import type { ThumbnailRecord } from "$types/configTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { log } from "$utils/logger/logger";
import { THUMBNAILS_DIR } from "$utils/paths";
import { sortJsonByKey } from "$utils/sortJson/sortJson";

export const thumbnails = writable<ThumbnailRecord>({});
export const thumbnailsGenerated = writable(0);
export const totalVideos = writable(0);

/** Clears cached blob URLs after a destructive thumbnail reset. */
export function clearPublishedThumbnails(): void {
	for (const oldUrl of Object.keys(activeBlobUrls)) URL.revokeObjectURL(oldUrl);
	activeBlobUrls = {};
	thumbnails.set({});
}

/** How many thumbnails generate concurrently. */
const GENERATION_CONCURRENCY = 4;

let isProcessing = false;
let pendingPromise: Promise<void> | null = null;

/**
 * Version of the thumbnail naming scheme (must match the Rust side).
 * Bump when the naming changes: existing configs with an older/missing
 * version are force-regenerated and orphaned thumbnail files are cleaned up.
 */
const CURRENT_THUMBNAIL_VERSION = 1;

/**
 * Blob URLs currently handed to the UI (blobUrl → videoPath).
 * Kept so stale URLs can be revoked when the store is replaced;
 * without this, every rescan leaks blob URLs until the app closes.
 */
let activeBlobUrls: ThumbnailRecord = {};

/** DOCS:
 * Handles the generation, storage, and management of video thumbnails in the application's data directory.
 * Coordinates thumbnail generation, blob loading, map persistence, and UI state synchronization.
 *
 * This function is concurrency-safe:
 * - If a thumbnail generation process is already running, subsequent calls will wait for the
 *   current execution to finish instead of running in parallel.
 *
 * Main responsibilities:
 * - Loads the thumbnail map from `thumbnails/map.json` (migrating it from
 *   config.json on first run — see {@link migrateThumbnailMapFromConfig}).
 * - Scans for new files when `newWallpapers` is enabled, reusing saved thumbnails;
 *   forced regeneration and outdated `thumbnailVersion` rebuild all previews.
 * - Generates missing thumbnails concurrently ({@link GENERATION_CONCURRENCY} at a time)
 *   and updates progress-related Svelte stores during generation.
 * - Persists the sorted thumbnail map to its own file.
 * - Removes entries for missing/renamed videos only after a successful folder scan.
 * - Cleans up orphaned thumbnail files not referenced by the mapping.
 * - Converts thumbnail files into blob URLs for UI consumption (revoking stale ones).
 * - Updates the thumbnails store used by the UI.
 *
 * Error handling:
 * - Errors during generation, blob loading, or store updates are logged individually
 *   without crashing the entire pipeline; user-actionable failures surface as toasts.
 *
 * @param forceRegenerate - Rebuilds all thumbnails (e.g. after a naming scheme change).
 * @param scanForNew - Scans the selected folder once even when automatic discovery is disabled.
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
export async function handleThumbnails(forceRegenerate = false, scanForNew = false): Promise<void> {
	const release = applicationWork.beginWork();
	try {
		if (isProcessing) {
			if (pendingPromise) await pendingPromise;
			return;
		}

		isProcessing = true;
		pendingPromise = withThumbnailOperation(async () => {
			try {
				let thumbnailsHashMap = await readThumbnailMap();

				if (Object.keys(thumbnailsHashMap).length === 0) {
					thumbnailsHashMap = await migrateThumbnailMapFromConfig();
				}

				const { newWallpapers, thumbnailVersion, wallpapersPath } = await fetchConfig();
				const needsMigration = (thumbnailVersion ?? 0) !== CURRENT_THUMBNAIL_VERSION;
				const regenerate = forceRegenerate || newWallpapers || scanForNew;
				let scannedAndPersisted = false;
				// Older builds removed map.json during orphan cleanup. Rebuild the index
				// from existing PNGs once, without generating anything when discovery is off.
				if (!regenerate && wallpapersPath && Object.keys(thumbnailsHashMap).length === 0) {
					try {
						const recovered = await invoke<ThumbnailRecord>("recover_thumbnails", {
							directory: wallpapersPath,
						});
						if (Object.keys(recovered).length > 0) {
							thumbnailsHashMap = sortJsonByKey(recovered);
							await writeThumbnailMap(thumbnailsHashMap);
						}
					} catch (error) {
						await log({
							level: "error",
							callStack: new Error(),
							message: { context: "Failed to restore saved thumbnails", error },
						});
					}
				}
				// Show valid cached previews before scanning for additional files.
				if ((newWallpapers || scanForNew) && !forceRegenerate && !needsMigration) {
					thumbnailsHashMap = await publishThumbnails(thumbnailsHashMap);
				}

				if (regenerate && !wallpapersPath) {
					totalVideos.set(0);
					await log({
						level: "warn",
						callStack: new Error(),
						message: {
							context:
								"Skipping thumbnail scan because no wallpapers path is configured",
						},
					});
				} else if (regenerate) {
					try {
						thumbnailsGenerated.set(0);
						const videosList = await fetchVideos();
						const reusable = forceRegenerate || needsMigration ? {} : thumbnailsHashMap;
						const cachedPaths = new Set(Object.values(reusable));
						const missingVideos = videosList.filter((path) => !cachedPaths.has(path));
						totalVideos.set(missingVideos.length);

						const { map: newThumbnailsHashMap, failures } = await processVideoPaths(
							missingVideos,
							forceRegenerate || needsMigration,
						);

						totalVideos.set(0);

						if (failures > 0) {
							toast.warning(get(t)("toast.thumbnails.failed"));
						}

						const listed = new Set(videosList);
						const generatedPaths = new Set(Object.values(newThumbnailsHashMap));
						const sorted = sortJsonByKey({
							// Keep the previous file if an explicit rebuild fails for that video.
							...Object.fromEntries(
								Object.entries(thumbnailsHashMap).filter(
									([, path]) => listed.has(path) && !generatedPaths.has(path),
								),
							),
							...newThumbnailsHashMap,
						});
						await writeThumbnailMap(sorted);
						const configPersisted = await updateConfig({
							thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
						});
						if (!configPersisted) {
							throw new Error("Failed to persist thumbnail version in configuration");
						}
						thumbnailsHashMap = sorted;
						scannedAndPersisted = true;
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

				// Only a successful scan can determine which cached files are orphaned.
				// Cache-only visits must not delete unindexed previews needed for recovery.
				if (scannedAndPersisted) {
					try {
						await invoke("cleanup_thumbnails", {
							keepFiles: ["map.json", ...Object.keys(thumbnailsHashMap)],
						});
					} catch (error) {
						await log({
							level: "warn",
							callStack: new Error(),
							message: {
								context: "Failed to clean up orphaned thumbnail files",
								error,
							},
						});
					}
				}

				try {
					const publishedThumbnails = await publishThumbnails(thumbnailsHashMap);
					if (JSON.stringify(publishedThumbnails) !== JSON.stringify(thumbnailsHashMap)) {
						thumbnailsHashMap = publishedThumbnails;
						try {
							await writeThumbnailMap(publishedThumbnails);
						} catch (error) {
							await log({
								level: "warn",
								callStack: new Error(),
								message: {
									context:
										"Failed to persist thumbnail map after removing unreadable previews",
									error,
								},
							});
						}
					}
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
		});

		await pendingPromise;
	} finally {
		release();
	}
}

/** Loads valid cached image files and publishes their blob URLs for the grid. */
async function publishThumbnails(map: ThumbnailRecord): Promise<ThumbnailRecord> {
	const valid: ThumbnailRecord = {};
	const blobUrls: ThumbnailRecord = {};
	for (const [fileName, videoPath] of Object.entries(map)) {
		try {
			const blobUrl = await fileToBlobUrl(fileName);
			valid[fileName] = videoPath;
			blobUrls[blobUrl] = videoPath;
		} catch (error) {
			await log({
				level: "error",
				callStack: new Error(),
				message: { context: "Failed to convert thumbnail file to blob URL", error },
			});
		}
	}
	for (const oldUrl of Object.keys(activeBlobUrls)) {
		if (!blobUrls[oldUrl]) URL.revokeObjectURL(oldUrl);
	}
	activeBlobUrls = blobUrls;
	thumbnails.set(blobUrls);
	return valid;
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
 * Processes a list of video paths to generate thumbnails and maps the resulting
 * file names to their respective video paths.
 *
 * Generates thumbnails concurrently (see {@link GENERATION_CONCURRENCY}) with a
 * worker-pool pattern: each worker pulls the next video index until the list is
 * exhausted. Failed generations are counted and reported, not fatal.
 *
 * @param videosList - An array of absolute paths to video files.
 *
 * @returns Resolves with the thumbnail filename → video path map and the
 *          number of videos whose thumbnail generation failed.
 *
 * @example
 * ```ts
 * const { map, failures } = await processVideoPaths(videoPaths);
 * ```
 */
async function processVideoPaths(
	videosList: string[],
	forceRegenerate = false,
): Promise<{ map: ThumbnailRecord; failures: number }> {
	const newThumbnailsHashMap: ThumbnailRecord = {};
	let failures = 0;
	let index = 0;

	const worker = async () => {
		while (index < videosList.length) {
			const videoPath = videosList[index++];
			try {
				const result = await generateThumb(videoPath, forceRegenerate);
				const fileName = result.ok ? await basename(result.value) : "";
				if (fileName) {
					newThumbnailsHashMap[fileName] = videoPath;
				} else {
					failures++;
				}
			} catch {
				failures++;
			}
			thumbnailsGenerated.update((count) => count + 1);
		}
	};

	const workerCount = Math.max(1, Math.min(GENERATION_CONCURRENCY, videosList.length));
	await Promise.all(Array.from({ length: workerCount }, worker));

	return { map: newThumbnailsHashMap, failures };
}
