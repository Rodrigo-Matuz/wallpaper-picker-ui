import { invoke } from "@tauri-apps/api/core";
import { fetchConfig } from "$api/config/read";
import { log } from "$utils/logger";

/** DOCS:
 * Fetches a list of video files from the directory specified in the application's configuration file.
 *
 * This function retrieves the configuration, checks the `wallpapersPath` field, and uses it to fetch a list of videos from the corresponding directory.
 * If the `wallpapersPath` is not set in the configuration, it logs a warning message for further implementation.
 * The function then logs the number of videos fetched and their source directory.
 *
 * @returns {Promise<string[]>} A promise that resolves to an array of video file paths retrieved from the specified directory.
 *
 *
 * @example
 * ```ts
 * try {
 *     const videos = await fetchVideos();
 *     console.log("Videos fetched successfully:", videos);
 * } catch (error) {
 *     console.error("Failed to fetch videos:", error);
 * }
 * ```
 */
export async function fetchVideos(): Promise<string[]> {
	const configFile = await fetchConfig();
	const wallpapersPathLocal = configFile.wallpapersPath;

	// No wallpapers path configured: scanning an empty path would return
	// nothing (or walk an invalid directory) — bail out early instead.
	if (!wallpapersPathLocal) {
		await log({
			level: "warn",
			callStack: new Error(),
			message: {
				context: "Wallpapers path is not set in config",
			},
		});

		return [];
	}

	const listOfVideos: string[] = await invoke("get_videos_list", {
		directory: wallpapersPathLocal,
	});

	await log({
		level: "info",
		callStack: new Error(),
		message: {
			context: "Fetched videos from wallpapers directory",
			count: listOfVideos.length,
			directory: wallpapersPathLocal,
		},
	});

	return listOfVideos;
}
