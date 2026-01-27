import { BaseDirectory, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { ensureConfig } from "$api/config/ensure";
import type { ConfigInterArgs } from "$types/configTypes";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH, CONFIG_ROOT_DIR } from "$utils/paths";

/** DOCS:
 * Updates the application's configuration file by merging the new configuration values with the existing ones.
 *
 * Reads the current configuration, merges it with the provided `newConfig` values,
 * and writes the updated configuration back to the file. Logs success or any errors.
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

    try {
        const file = await readTextFile(CONFIG_FILE_PATH, {
            baseDir: BaseDirectory.Config,
        });

        const currentConfig: ConfigInterArgs = JSON.parse(file);

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
