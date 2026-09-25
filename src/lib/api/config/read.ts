import { BaseDirectory, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "$api/config/defaults";
import { ensureConfig } from "$api/config/ensure";
import type { ConfigInterArgs } from "$types/configTypes";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH } from "$utils/paths";

/**
 * In-memory cache of the last known configuration.
 *
 * The config file lives on disk and is read on every `fetchConfig()` call in
 * the uncached path; since config is read extremely often (logging, settings
 * rows, thumbnail pipeline), it is cached after the first successful read and
 * kept in sync by {@link setConfigCache} (called by `updateConfig`) and
 * {@link clearConfigCache} (called by `clearConfig`).
 */
let configCache: ConfigInterArgs | null = null;

/** Returns the cached config without reading from disk (or null if not yet cached). */
export function peekConfig(): ConfigInterArgs | null {
	return configCache;
}

/** Replaces the in-memory config cache (used after a successful write). */
export function setConfigCache(config: ConfigInterArgs): void {
	configCache = config;
}

/** Drops the in-memory config cache (used after the config file is deleted). */
export function clearConfigCache(): void {
	configCache = null;
}

/** DOCS:
 * Fetches the application configuration.
 *
 * Serves the in-memory cache when available; otherwise ensures the config file
 * exists, reads and parses it, and caches the result.
 *
 * If the config file exists but cannot be parsed (corrupted JSON), the error
 * is logged, the file is repaired with {@link defaultConfig}, and the defaults
 * are returned instead of crashing the app.
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
 * @throws Will rethrow errors encountered during file reading
 *         (parse errors are recovered with defaults instead).
 */
export async function fetchConfig(): Promise<ConfigInterArgs> {
	if (configCache) return configCache;

	await ensureConfig();

	let file: string;
	try {
		file = await readTextFile(CONFIG_FILE_PATH, {
			baseDir: BaseDirectory.Config,
		});
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

	try {
		const configData: ConfigInterArgs = JSON.parse(file);
		configCache = configData;
		return configData;
	} catch (error) {
		await log({
			level: "error",
			callStack: error instanceof Error ? error : new Error("Unknown error"),
			message: {
				context: "Configuration file is corrupted, falling back to defaults",
				error,
			},
		});

		// Corrupted config: repair the file with defaults so the app keeps working.
		configCache = { ...defaultConfig };
		try {
			const data = new TextEncoder().encode(JSON.stringify(defaultConfig, null, 4));
			await writeFile(CONFIG_FILE_PATH, data, {
				baseDir: BaseDirectory.Config,
			});
			await log({
				level: "warn",
				callStack: new Error(),
				message: {
					context: "Configuration file repaired with default values",
				},
			});
		} catch (writeError) {
			await log({
				level: "error",
				callStack: writeError instanceof Error ? writeError : new Error("Unknown error"),
				message: {
					context: "Failed to repair configuration file with defaults",
					error: writeError,
				},
			});
		}

		return configCache;
	}
}
