import { invoke } from "@tauri-apps/api/core";
import { fetchConfig } from "$api/config/read";
import { log } from "$utils/logger";

/** DOCS:
 * Sends a command to the backend using the provided video path, invoking a Tauri command with the user's configuration settings.
 *
 * Retrieves the user-defined command from the application's configuration, then sends the command along with the provided `videoPath` to the backend.
 * Logs success or failure using the structured logger.
 *
 * @param videoPath - Absolute path to the video that the command should be executed on.
 *
 * @returns Resolves once the command has been sent and logging is complete.
 *
 * @example
 * ```ts
 * await sendCommand("/path/to/video.mp4");
 * ```
 */
export async function sendCommand(videoPath: string): Promise<void> {
	try {
		const userCommand = (await fetchConfig()).command;

		await invoke("send_command", { command: userCommand, path: videoPath });

		await log({
			level: "positive",
			callStack: new Error(),
			message: {
				context: "Command sent successfully",
				error: `Command: "${userCommand}" for video: ${videoPath}`,
			},
		});
	} catch (error) {
		await log({
			level: "error",
			callStack: error instanceof Error ? error : new Error("Unknown error"),
			message: {
				context: "Failed to send command",
				error: `Video: ${videoPath}`,
			},
		});
	}
}
