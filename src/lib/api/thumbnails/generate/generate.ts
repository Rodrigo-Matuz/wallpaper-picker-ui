import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import type { ApiResult } from "$types/resultTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { ensureDir } from "$utils/ensureDirs";
import { log } from "$utils/logger/logger";
import { THUMBNAILS_DIR } from "$utils/paths";

/** DOCS:
 * Generates a thumbnail for a specified video and saves it in the application's data directory under the "thumbnails" folder.
 *
 * Ensures the "thumbnails" directory exists before invoking the backend Tauri
 * command responsible for thumbnail generation.
 *
 * @param videoPath - The absolute path to the video file for which the thumbnail is to be generated.
 * @param forceRegenerate - Rebuild an existing thumbnail instead of reusing it.
 *
 * @returns Resolves with an {@link ApiResult}: the thumbnail path on success,
 *          or a descriptive error string on failure.
 *
 * Errors during thumbnail generation are caught, logged, and returned as
 * `{ ok: false, error }` instead of a sentinel value.
 *
 * @example
 * ```ts
 * const result = await generateThumb("/path/to/video.mp4");
 * if (result.ok) console.log("Thumbnail saved at:", result.value);
 * ```
 */
export async function generateThumb(
	videoPath: string,
	forceRegenerate = false,
): Promise<ApiResult<string>> {
	const release = applicationWork.beginWork();
	try {
		await ensureDir(THUMBNAILS_DIR, BaseDirectory.AppData);

		try {
			const value = await invoke<string>("generate_thumb", {
				forceRegenerate,
				videoPath,
			});
			return { ok: true, value };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			await log({
				level: "error",
				callStack: error instanceof Error ? error : new Error(),
				message: {
					context: "Error generating thumbnail",
					error,
				},
			});

			return { ok: false, error: message };
		}
	} finally {
		release();
	}
}
