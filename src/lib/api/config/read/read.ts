import { BaseDirectory, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "$api/config/defaults";
import { ensureConfig } from "$api/config/ensure/ensure";
import { type ConfigMutationOwner, queueConfigMutation } from "$api/config/mutationOrdering";
import type { ConfigInterArgs } from "$types/configTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { log } from "$utils/logger/logger";
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

/** DOCS: Read-only logging source for config prerequisites that already own the queue.
 * Uses only confirmed cached data or defaults; never enqueues, repairs or publishes cache.
 * Returning defaults here is diagnostic policy, not a persistence acknowledgement.
 */
export async function readConfigForDiagnostics(): Promise<ConfigInterArgs> {
	return configCache ?? defaultConfig;
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
 * exists, reads and parses it, and caches the result under the mutation queue.
 * An explicit active owner lets UPDATE/DELETE diagnostics read without self-deadlock.
 *
 * If the config file exists but cannot be parsed (corrupted JSON), the error
 * is logged, the file is repaired with {@link defaultConfig}, and the defaults
 * are returned instead of crashing the app.
 *
 * @returns Resolves with the configuration data as an object.
 * @param owner - Internal mutation identity for an owned nested read, never a busy flag.
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
export async function fetchConfig(owner?: ConfigMutationOwner): Promise<ConfigInterArgs> {
	if (configCache) return configCache;
	const release = applicationWork.beginWork();
	try {
		return await queueConfigMutation(readConfig, owner);
	} finally {
		release();
	}
}

async function readConfig(): Promise<ConfigInterArgs> {
	// Recheck after waiting: a preceding SAVE may have populated the cache.
	if (configCache) return configCache;

	await ensureConfig();

	let file: string;
	try {
		file = await readTextFile(CONFIG_FILE_PATH, {
			baseDir: BaseDirectory.Config,
		});
	} catch (error) {
		await log(
			{
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Failed to read configuration file",
					error,
				},
			},
			async () => defaultConfig,
		);

		throw error;
	}

	try {
		const configData: ConfigInterArgs = JSON.parse(file);
		configCache = configData;
		return configData;
	} catch (error) {
		return await repairCorruptConfig(error);
	}
}

/** Own corrupt-file recovery through diagnostics and the repair attempt, not cache hits. */
async function repairCorruptConfig(error: unknown): Promise<ConfigInterArgs> {
	const release = applicationWork.beginWork();
	const fallback = { ...defaultConfig };
	const diagnosticConfig = async () => fallback;
	try {
		await log(
			{
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Configuration file is corrupted, falling back to defaults",
					error,
				},
			},
			diagnosticConfig,
		);

		// Corrupted config: repair the file with defaults so the app keeps working.
		try {
			const data = new TextEncoder().encode(JSON.stringify(defaultConfig, null, 4));
			await writeFile(CONFIG_FILE_PATH, data, {
				baseDir: BaseDirectory.Config,
			});
			configCache = fallback;
			await log(
				{
					level: "warn",
					callStack: new Error(),
					message: {
						context: "Configuration file repaired with default values",
					},
				},
				diagnosticConfig,
			);
		} catch (writeError) {
			await log(
				{
					level: "error",
					callStack:
						writeError instanceof Error ? writeError : new Error("Unknown error"),
					message: {
						context: "Failed to repair configuration file with defaults",
						error: writeError,
					},
				},
				diagnosticConfig,
			);
		}

		return fallback;
	} finally {
		release();
	}
}
