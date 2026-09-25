import { invoke } from "@tauri-apps/api/core";
import { appDataDir, basename } from "@tauri-apps/api/path";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { get, writable } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read";
import { updateConfig } from "$api/config/update";
import { fetchVideos } from "$api/system/fetchVideos";
import { generateThumb } from "$api/thumbnails/generate";
import {
	migrateThumbnailMapFromConfig,
	readThumbnailMap,
	writeThumbnailMap,
} from "$api/thumbnails/map";
import { t } from "$lang/index";
import type { ThumbnailRecord } from "$types/configTypes";
import { log } from "$utils/logger";
import { THUMBNAILS_DIR } from "$utils/paths";
import { sortJsonByKey } from "$utils/sortJson";

export const thumbnails = writable<ThumbnailRecord>({});
export const thumbnailsGenerated = writable(0);
export const totalVideos = writable(0);

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
 * - Determines whether regeneration is needed (config `newWallpapers` flag,
 *   forced regeneration, or an outdated `thumbnailVersion`).
 * - Generates thumbnails concurrently ({@link GENERATION_CONCURRENCY} at a time)
 *   and updates progress-related Svelte stores during generation.
 * - Persists the sorted thumbnail map to its own file.
 * - Prunes mapping entries whose video file no longer exists (deleted/renamed videos).
 * - Cleans up orphaned thumbnail files not referenced by the mapping.
 * - Converts thumbnail files into blob URLs for UI consumption (revoking stale ones).
 * - Updates the thumbnails store used by the UI.
 *
 * Error handling:
 * - Errors during generation, blob loading, or store updates are logged individually
 *   without crashing the entire pipeline; user-actionable failures surface as toasts.
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
			let thumbnailsHashMap = await readThumbnailMap();

			if (Object.keys(thumbnailsHashMap).length === 0) {
				thumbnailsHashMap = await migrateThumbnailMapFromConfig();
			}

			const { newWallpapers, thumbnailVersion } = await fetchConfig();
			const needsMigration = (thumbnailVersion ?? 0) !== CURRENT_THUMBNAIL_VERSION;
			const regenerate = forceRegenerate || needsMigration || newWallpapers;

			if (regenerate) {
				try {
					thumbnailsGenerated.set(0);
					const videosList = await fetchVideos();
					totalVideos.set(videosList.length);

					const { map: newThumbnailsHashMap, failures } =
						await processVideoPaths(videosList);

					totalVideos.set(0);

					if (failures > 0) {
						toast.warning(get(t)("toast.thumbnails.failed"));
					}

					const sorted = sortJsonByKey(newThumbnailsHashMap);
					await writeThumbnailMap(sorted);
					await updateConfig({ thumbnailVersion: CURRENT_THUMBNAIL_VERSION });
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
			} else {
				thumbnailsHashMap = await pruneMissingVideos(thumbnailsHashMap);
			}

			// Remove orphaned thumbnail files (deleted videos, old naming scheme).
			try {
				await invoke("cleanup_thumbnails", {
					thumbPath: `${await appDataDir()}/${THUMBNAILS_DIR}`,
					keepFiles: Object.keys(thumbnailsHashMap),
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

			try {
				const blobUrlsHashMap: ThumbnailRecord = {};
				for (const [fileName, videoPath] of Object.entries(thumbnailsHashMap) as [
					string,
					string,
				][]) {
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

				// Revoke blob URLs that are no longer referenced by the new store.
				for (const oldUrl of Object.keys(activeBlobUrls)) {
					if (!blobUrlsHashMap[oldUrl]) {
						URL.revokeObjectURL(oldUrl);
					}
				}
				activeBlobUrls = blobUrlsHashMap;

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
 * Removes mapping entries whose video file no longer exists on disk.
 *
 * Existence is checked in Rust (`validate_video_paths`) because wallpaper
 * paths live outside the app's fs capabilities. Pruned mappings are
 * persisted back to the map file.
 *
 * @param map - Current thumbnail filename → video path mapping.
 *
 * @returns The pruned mapping (sorted, persisted) or the original mapping
 *          if validation failed or nothing changed.
 *
 * @example
 * ```ts
 * thumbnailsHashMap = await pruneMissingVideos(thumbnailsHashMap);
 * ```
 */
async function pruneMissingVideos(map: ThumbnailRecord): Promise<ThumbnailRecord> {
	const entries = Object.entries(map) as [string, string][];

	if (entries.length === 0) return map;

	try {
		const existing = new Set(
			await invoke<string[]>("validate_video_paths", {
				paths: entries.map(([, videoPath]) => videoPath),
			}),
		);

		if (existing.size === entries.length) return map;

		const sorted = sortJsonByKey(
			Object.fromEntries(entries.filter(([, videoPath]) => existing.has(videoPath))),
		);
		await writeThumbnailMap(sorted);
		return sorted;
	} catch (error) {
		await log({
			level: "error",
			callStack: new Error(),
			message: {
				context: "Failed to validate video paths for thumbnails",
				error,
			},
		});
		return map;
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
): Promise<{ map: ThumbnailRecord; failures: number }> {
	const newThumbnailsHashMap: ThumbnailRecord = {};
	let failures = 0;
	let index = 0;

	const worker = async () => {
		while (index < videosList.length) {
			const videoPath = videosList[index++];
			try {
				const result = await generateThumb(videoPath);
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
