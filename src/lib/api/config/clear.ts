import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { log } from "$utils/logger";
import { CONFIG_FILE_PATH} from "$utils/paths"

/** DOCS:
 * Deletes the configuration file from the application config directory.
 *
 * This function removes the "config.json" file from the application configuration directory.
 * If the operation is successful, a success message is logged. If an error occurs during the
 * deletion, an error message is logged using a structured format.
 *
 * @returns Resolves once the deletion attempt and logging are complete.
 *
 * @example
 * ```ts
 * await clearConfig();
 * ```
 */
export const clearConfig = async (): Promise<void> => {
	try {

		await remove(CONFIG_FILE_PATH, { baseDir: BaseDirectory.Config });

		await log({
			level: "positive",
			callStack: new Error(),
			message: {
				context: "Configuration file deleted successfully",
			},
		});
	} catch (error) {
		await log({
			level: "error",
			callStack: error instanceof Error ? error : new Error("Unknown error"),
			message: {
				context: "Failed to delete configuration file",
				error,
			},
		});
	}
};
