import { BaseDirectory, exists, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { fetchConfig } from "$api/config/read";
import { updateConfig } from "$api/config/update";
import type { ThumbnailRecord } from "$types/configTypes";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger";
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
	await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

	try {
		const mapExists = await exists(MAP_FILE, { baseDir: BaseDirectory.AppData });
		if (!mapExists) return {};

		return JSON.parse(
			await readTextFile(MAP_FILE, { baseDir: BaseDirectory.AppData }),
		) as ThumbnailRecord;
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
}

/** DOCS:
 * Writes the thumbnail map to the thumbnails directory (creating the
 * directory if needed). Errors are logged and rethrown so callers can react.
 *
 * @param map - The thumbnail filename → video path mapping to persist.
 *
 * @example
 * ```ts
 * await writeThumbnailMap(sortedMap);
 * ```
 */
export async function writeThumbnailMap(map: ThumbnailRecord): Promise<void> {
	await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

	try {
		const data = new TextEncoder().encode(JSON.stringify(map, null, 4));
		await writeFile(MAP_FILE, data, { baseDir: BaseDirectory.AppData });
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
}

/** DOCS:
 * One-time migration: moves `thumbnailsHashMap` out of config.json into
 * `map.json` if the map file does not exist yet but the config still holds
 * entries. The config field is cleared afterwards.
 *
 * @returns The migrated map, or an empty record when there was nothing to migrate.
 *
 * @example
 * ```ts
 * let map = await migrateThumbnailMapFromConfig();
 * ```
 */
export async function migrateThumbnailMapFromConfig(): Promise<ThumbnailRecord> {
	const mapExists = await exists(MAP_FILE, { baseDir: BaseDirectory.AppData });

	if (mapExists) return {};

	const legacy = (await fetchConfig()).thumbnailsHashMap;
	if (!legacy || Object.keys(legacy).length === 0) return {};

	try {
		await writeThumbnailMap(legacy);
		await updateConfig({ thumbnailsHashMap: {} });
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
}
