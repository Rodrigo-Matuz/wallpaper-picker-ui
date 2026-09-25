import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { ensureConfig } from "$api/config/ensure";
import { fetchConfig, setConfigCache } from "$api/config/read";
import type { ConfigInterArgs } from "$types/configTypes";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH, CONFIG_ROOT_DIR } from "$utils/paths";

/**
 * Serializes config writes so concurrent `updateConfig` calls cannot
 * interleave their read-modify-write cycles and lose each other's changes.
 */
let writeQueue: Promise<void> = Promise.resolve();

/** DOCS:
 * Updates the application's configuration file by merging the new configuration values with the existing ones.
 *
 * Reads the current configuration (from the in-memory cache when available),
 * merges it with the provided `newConfig` values, and writes the updated
 * configuration back to the file. Writes are serialized through a queue so
 * concurrent updates never lose data. Logs success or any errors.
 *
 * @param newConfig - Partial configuration values to merge into the current config.
 *
 * @returns Resolves when the configuration has been successfully updated.
 *
 * @example
 * ```ts
 * await updateConfig({ debugMode: true, darkMode: true });
 * ```
 */
export async function updateConfig(newConfig: Partial<ConfigInterArgs>): Promise<void> {
    await ensureDir(CONFIG_ROOT_DIR, BaseDirectory.Config);
    await ensureConfig();

    const run = writeQueue.then(() => performUpdate(newConfig));
    writeQueue = run.catch(() => {});
    return run;
}

async function performUpdate(newConfig: Partial<ConfigInterArgs>): Promise<void> {
    try {
        const currentConfig = await fetchConfig();

        const updatedConfig: ConfigInterArgs = {
            ...currentConfig,
            ...newConfig,
            thumbnailsHashMap: newConfig.thumbnailsHashMap || currentConfig.thumbnailsHashMap,
        };

        const data = new TextEncoder().encode(JSON.stringify(updatedConfig, null, 4));

        try {
            await writeFile(CONFIG_FILE_PATH, data, {
                baseDir: BaseDirectory.Config,
            });

            // Keep the in-memory cache in sync with what was just written.
            setConfigCache(updatedConfig);

            await log({
                level: "positive",
                callStack: new Error(),
                message: "Configuration updated successfully",
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
    } catch (error) {
        await log({
            level: "error",
            callStack: error instanceof Error ? error : new Error("Unknown error"),
            message: {
                context: "Failed to read configuration file",
                error,
            },
        });
    }
}