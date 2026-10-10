import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import {
	type ConfigMutationOwner,
	confirmConfigReset,
	queueConfigMutation,
} from "$api/config/mutationOrdering";
import { clearConfigCache, fetchConfig } from "$api/config/read/read";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { log } from "$utils/logger/logger";
import { CONFIG_FILE_PATH } from "$utils/paths";

/** DOCS:
 * Deletes the configuration file from the application config directory.
 *
 * This function removes the "config.json" file from the application configuration directory.
 * If the operation is successful, a success message is logged. If an error occurs during the
 * deletion, an error message is logged using a structured format.
 *
 * @returns True only after confirmed deletion; reported delete failures return false.
 *          Admission/logging rejections retain their rejection semantics.
 *
 * @example
 * ```ts
 * await clearConfig();
 * ```
 */
export const clearConfig = async (): Promise<boolean> => {
	const release = applicationWork.beginWork();
	try {
		return await queueConfigMutation(performClear);
	} finally {
		release();
	}
};

async function performClear(owner: ConfigMutationOwner): Promise<boolean> {
	let persisted = false;
	try {
		await remove(CONFIG_FILE_PATH, { baseDir: BaseDirectory.Config });

		// Drop the in-memory cache so the next fetch re-creates the file.
		clearConfigCache();
		persisted = true;
		confirmConfigReset();

		await log(
			{
				level: "positive",
				callStack: new Error(),
				message: {
					context: "Configuration file deleted successfully",
				},
			},
			() => fetchConfig(owner),
		);
	} catch (error) {
		await log(
			{
				level: "error",
				callStack: error instanceof Error ? error : new Error("Unknown error"),
				message: {
					context: "Failed to delete configuration file",
					error,
				},
			},
			() => fetchConfig(owner),
		);
	}
	return persisted;
}
