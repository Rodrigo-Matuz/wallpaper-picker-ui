import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { ensureConfig } from "$api/config/ensure/ensure";
import { type ConfigMutationOwner, queueConfigMutation } from "$api/config/mutationOrdering";
import { fetchConfig, readConfigForDiagnostics, setConfigCache } from "$api/config/read/read";
import type { ConfigInterArgs } from "$types/configTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger/logger";
import { CONFIG_FILE_PATH, CONFIG_ROOT_DIR } from "$utils/paths";

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
 * @returns True only after a confirmed write. Reported read/write failures return false;
 *          prerequisite/logging rejections retain their existing rejection semantics.
 *
 * @example
 * ```ts
 * await updateConfig({ debugMode: true, darkMode: true });
 * ```
 */
export async function updateConfig(newConfig: Partial<ConfigInterArgs>): Promise<boolean> {
	const release = applicationWork.beginWork();
	try {
		// Own queued execution and logging until settlement, including reported failures.
		return await queueConfigMutation(async (owner) => {
			await ensureDir(CONFIG_ROOT_DIR, BaseDirectory.Config, readConfigForDiagnostics);
			await ensureConfig();
			return await performUpdate(newConfig, owner);
		});
	} finally {
		release();
	}
}

async function performUpdate(
	newConfig: Partial<ConfigInterArgs>,
	owner: ConfigMutationOwner,
): Promise<boolean> {
	let persisted = false;
	try {
		const currentConfig = await fetchConfig(owner);

		const updatedConfig: ConfigInterArgs = {
			...currentConfig,
			...newConfig,
		};

		const data = new TextEncoder().encode(JSON.stringify(updatedConfig, null, 4));

		try {
			await writeFile(CONFIG_FILE_PATH, data, {
				baseDir: BaseDirectory.Config,
			});

			// Keep the in-memory cache in sync with what was just written.
			setConfigCache(updatedConfig);
			persisted = true;

			await log(
				{
					level: "positive",
					callStack: new Error(),
					message: "Configuration updated successfully",
				},
				() => fetchConfig(owner),
			);
		} catch (error) {
			await log(
				{
					level: "error",
					callStack: error instanceof Error ? error : new Error("Unknown error"),
					message: {
						context: "Failed to write configuration file",
						error,
					},
				},
				() => fetchConfig(owner),
			);
		}
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
			() => fetchConfig(owner),
		);
	}
	return persisted;
}
