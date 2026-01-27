import { BaseDirectory, exists, writeFile } from "@tauri-apps/plugin-fs";
import type { ConfigInterArgs } from "$types/configTypes";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH } from "$utils/paths"

// TODO: Separate thumbnailsHashMap in it's own file
const defaultConfig: ConfigInterArgs = {
	command: "",
	wallpapersPath: "",
	debugMode: false,
	newWallpapers: true,
	darkMode: true,
	language: "eng",
	thumbnailsHashMap: {},
};

/** DOCS:
 * Ensures that the configuration file exists.
 *
 * This function is responsible for guaranteeing that the application's
 * configuration file is present before any read operations occur.
 *
 * The process includes:
 * - Ensuring the configuration directory exists.
 * - Checking if the configuration file already exists.
 * - Creating a new configuration file with default values if it does not.
 *
 * The default configuration includes:
 * - `command`: An empty string.
 * - `wallpapersPath`: An empty string.
 * - `newWallpapers`: A boolean set to true.
 * - `debugMode`: A boolean set to false.
 * - `darkMode`: A boolean set to true.
 * - `language`: A string, default to "eng".
 * - `thumbnailsHashMap`: An empty object.
 *
 * Any error that occurs during file creation will be logged.
 * This function does not throw if writing fails, allowing the caller
 * to decide how to proceed.
 *
 * @returns Resolves when the configuration file is ensured.
 *
 * @example
 * ```ts
 * await ensureConfig();
 * ```
 */
export async function ensureConfig(): Promise<void> {
	await ensureDir("WallpaperPickerUI", BaseDirectory.Config);

	const configExists = await exists(CONFIG_FILE_PATH, {
		baseDir: BaseDirectory.Config,
	});

	if (configExists) return;

	try {
		const data = new TextEncoder().encode(
			JSON.stringify(defaultConfig, null, 4),
		);

		await writeFile(CONFIG_FILE_PATH, data, {
			baseDir: BaseDirectory.Config,
		});

	} catch (error) {
		await log({
			level: "error",
			callStack: error instanceof Error ? error : new Error("Unknown error"),
			message: {
				context: "Failed to write configuration file",
				error,
			},
		});
	}
}
