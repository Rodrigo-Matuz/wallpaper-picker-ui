import {
	BaseDirectory,
	exists,
	readTextFile,
	remove,
	rename,
	writeFile,
} from "@tauri-apps/plugin-fs";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import type { ThumbnailRecord } from "$types/configTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger/logger";
import { THUMBNAILS_DIR } from "$utils/paths";

/**
 * The thumbnail filename → video path map, persisted as its own JSON file
 * inside the thumbnails directory (`map.json`) instead of inside config.json.
 *
 * Rationale: the map can be large and is rewritten on every regeneration —
 * keeping it out of config.json prevents constant rewrite amplification of
 * the (small, precious) user settings file. This resolves the old
 * "separate thumbnailsHashMap" TODO.
 */
const MAP_FILE = `${THUMBNAILS_DIR}/map.json`;
const MAP_TEMP_FILE = `${MAP_FILE}.tmp`;

function isValidThumbnailFileName(fileName: string): boolean {
	return (
		fileName.length > 0 &&
		fileName.endsWith(".png") &&
		fileName !== ".png" &&
		!fileName.includes("/") &&
		!fileName.includes("\\")
	);
}

function isThumbnailRecord(value: unknown): value is ThumbnailRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.entries(value).every(
		([fileName, videoPath]) =>
			isValidThumbnailFileName(fileName) &&
			typeof videoPath === "string" &&
			videoPath.length > 0,
	);
}

/** DOCS:
 * Reads the thumbnail map from the thumbnails directory.
 *
 * Returns an empty record when the file does not exist yet or cannot be
 * parsed (the caller is expected to regenerate).
 *
 * @returns Resolves with the thumbnail map (possibly empty).
 *
 * @example
 * ```ts
 * const map = await readThumbnailMap();
 * ```
 */
export async function readThumbnailMap(): Promise<ThumbnailRecord> {
	// Even a standalone read may create the directory; retain its entire lifetime.
	const release = applicationWork.beginWork();
	try {
		await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

		try {
			const mapExists = await exists(MAP_FILE, { baseDir: BaseDirectory.AppData });
			if (!mapExists) return {};

			const parsed: unknown = JSON.parse(
				await readTextFile(MAP_FILE, { baseDir: BaseDirectory.AppData }),
			);
			if (!isThumbnailRecord(parsed)) {
				throw new Error("Thumbnail map has an invalid shape");
			}
			return parsed;
		} catch (error) {
			await log({
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Failed to read thumbnail map file",
					error,
				},
			});
			return {};
		}
	} finally {
		release();
	}
}

/** DOCS:
 * Writes the thumbnail map to the thumbnails directory (creating the
 * directory if needed). The payload is written to a scoped temporary file and
 * renamed into place so readers never observe a partially serialized map.
 * Errors are logged and rethrown so callers can react.
 *
 * @param map - The thumbnail filename → video path mapping to persist.
 *
 * @example
 * ```ts
 * await writeThumbnailMap(sortedMap);
 * ```
 */
export async function writeThumbnailMap(map: ThumbnailRecord): Promise<void> {
	const release = applicationWork.beginWork();
	try {
		await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

		try {
			if (!isThumbnailRecord(map)) {
				throw new Error("Thumbnail map has an invalid shape");
			}
			const data = new TextEncoder().encode(JSON.stringify(map, null, 4));
			await writeFile(MAP_TEMP_FILE, data, { baseDir: BaseDirectory.AppData });
			try {
				await rename(MAP_TEMP_FILE, MAP_FILE, {
					oldPathBaseDir: BaseDirectory.AppData,
					newPathBaseDir: BaseDirectory.AppData,
				});
			} catch (error) {
				try {
					await remove(MAP_TEMP_FILE, { baseDir: BaseDirectory.AppData });
				} catch {
					// Preserve the original rename failure; a stale temp file is harmless.
				}
				throw error;
			}
		} catch (error) {
			await log({
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Failed to write thumbnail map file",
					error,
				},
			});
			throw error;
		}
	} finally {
		release();
	}
}

/** DOCS:
 * One-time migration: moves `thumbnailsHashMap` out of config.json into
 * `map.json` if the map file does not exist yet but the config still holds
 * config still holds entries. The config field is cleared afterwards. If
 * configuration persistence is not confirmed, the newly written map is removed
 * so a later launch can retry the migration.
 *
 * @returns The migrated map, or an empty record when there was nothing to migrate.
 *
 * @example
 * ```ts
 * let map = await migrateThumbnailMapFromConfig();
 * ```
 */
export async function migrateThumbnailMapFromConfig(): Promise<ThumbnailRecord> {
	const release = applicationWork.beginWork();
	try {
		const mapExists = await exists(MAP_FILE, { baseDir: BaseDirectory.AppData });

		if (mapExists) return {};

		const legacy = (await fetchConfig()).thumbnailsHashMap;
		if (!isThumbnailRecord(legacy) || Object.keys(legacy).length === 0) return {};

		const rollbackMigration = async () => {
			try {
				await remove(MAP_FILE, { baseDir: BaseDirectory.AppData });
			} catch (rollbackError) {
				await log({
					level: "error",
					callStack:
						rollbackError instanceof Error ? rollbackError : new Error("Unknown error"),
					message: {
						context: "Failed to roll back migrated thumbnail map",
						error: rollbackError,
					},
				});
			}
		};

		try {
			await writeThumbnailMap(legacy);
			try {
				const configCleared = await updateConfig({ thumbnailsHashMap: {} });
				if (!configCleared) {
					throw new Error(
						"Configuration did not confirm clearing the legacy thumbnail map",
					);
				}
			} catch (error) {
				await rollbackMigration();
				throw error;
			}
			await log({
				level: "info",
				callStack: new Error(),
				message: {
					context: "Migrated thumbnailsHashMap from config.json to map.json",
					count: Object.keys(legacy).length,
				},
			});
			return legacy;
		} catch (error) {
			await log({
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Failed to migrate thumbnailsHashMap to map.json",
					error,
				},
			});
			return {};
		}
	} finally {
		release();
	}
}
