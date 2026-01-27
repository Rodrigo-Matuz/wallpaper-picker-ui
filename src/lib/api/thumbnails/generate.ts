import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger";
import { THUMBNAILS_DIR } from "$utils/paths";

/** DOCS:
 * Generates a thumbnail for a specified video and saves it in the application's data directory under the "thumbnails" folder.
 *
 * Ensures the "thumbnails" directory exists before invoking the backend Tauri
 * command responsible for thumbnail generation.
 *
 * @param videoPath - The absolute path to the video file for which the thumbnail is to be generated.
 *
 * @returns Resolves with the path to the generated thumbnail upon success.
 * 
 * Errors during thumbnail generation are caught and logged.
 *
 * @example
 * ```ts
 * const thumbnailPath = await generateThumb("/path/to/video.mp4");
 * console.log("Thumbnail saved at:", thumbnailPath);
 * ```
 */
export async function generateThumb(videoPath: string): Promise<string> {
	await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

	try {
		const thumbPath = `${await appDataDir()}/${THUMBNAILS_DIR}`;
		return await invoke<string>("generate_thumb", { 
			videoPath,
			thumbPath
		});
	} catch (error) {
		await log({
			level: "error",
			callStack: new Error(),
			message: {
				context: "Error generating thumbnail",
				error,
			},
		});
		// TODO: Improve returning in case of failure aside from the logs
		return "";
	}

}
