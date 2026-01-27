import { type BaseDirectory, exists, mkdir } from "@tauri-apps/plugin-fs";
import { log } from "./logger";

/** DOCS:
 * Ensures that a directory exists under a given Tauri base directory.
 *
 * Checks whether the directory exists and creates it if necessary.
 * Any errors encountered during the process are caught and logged
 * using the `log` function.
 *
 * @param dirName - Name of the directory to ensure.
 * @param baseDir - Tauri base directory in which the directory should exist.
 *
 * @returns Resolves once the directory check and creation (if necessary) are complete.
 *
 * @example
 * ```ts
 * // Ensure the thumbnails directory exists in AppData
 * await ensureDir("thumbnails", BaseDirectory.AppData);
 *
 * // Ensure the Wallpaper Picker UI directory exists in the .config/ directory
 * await ensureDir("WallpaperPickerUI", BaseDirectory.Config);
 * ```
 */
export async function ensureDir(dirName: string, baseDir: BaseDirectory): Promise<void> {
    try {
        const dirExists = await exists(dirName, { baseDir });

        if (!dirExists) {
            await mkdir(dirName, { baseDir });
        }
    } catch (error) {
        await log({
            level: "error",
            callStack: error instanceof Error ? error : new Error(),
            message: {
                context: `Failed to ensure '${dirName}' directory`,
                error,
            },
        });
    }
}
