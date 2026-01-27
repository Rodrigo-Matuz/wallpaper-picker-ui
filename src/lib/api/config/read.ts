import { BaseDirectory, readTextFile } from "@tauri-apps/plugin-fs";
import { ensureConfig } from "$api/config/ensure";
import type { ConfigInterArgs } from "$types/configTypes";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH } from "$utils/paths";

/** DOCS:
 * Fetches the configuration file.
 *
 * This function ensures that the configuration file exists before
 * attempting to read it by calling {@link ensureConfig}.
 *
 * After ensuring existence, it reads the configuration file,
 * parses its contents, and returns the configuration object.
 *
 * If any error occurs during file reading or JSON parsing,
 * the error is logged and then rethrown.
 *
 * @returns Resolves with the configuration data as an object.
 *
 * @example
 * ```ts
 * try {
 *     const config = await fetchConfig();
 *     console.log(config);
 * } catch (error) {
 *     console.error("Failed to fetch configuration:", error);
 * }
 * ```
 *
 * @throws Will rethrow any error encountered during file read or parse operations.
 */
export async function fetchConfig(): Promise<ConfigInterArgs> {
	await ensureConfig();

	try {
		const file = await readTextFile(CONFIG_FILE_PATH, {
			baseDir: BaseDirectory.Config,
		});

		const configData: ConfigInterArgs = JSON.parse(file);
		return configData;
	} catch (error) {
		await log({
			level: "error",
			callStack: error instanceof Error ? error : new Error("Unknown error"),
			message: {
				context: "Failed to read configuration file",
				error,
			},
		});

		throw error;
	}
}
