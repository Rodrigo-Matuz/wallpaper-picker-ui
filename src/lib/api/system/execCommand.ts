import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read";
import { t } from "$lang/index";
import { log } from "$utils/logger";

/** DOCS:
 * Sends a command to the backend using the provided video path, invoking a Tauri command with the user's configuration settings.
 *
 * Retrieves the user-defined command from the application's configuration, then sends the command along with the provided `videoPath` to the backend.
 * Warns via toast when no command is configured, and toasts spawn failures so
 * the user actually sees them (the backend only fails when the shell itself
 * could not be started). Logs success or failure using the structured logger.
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

		if (!userCommand || !userCommand.trim()) {
			toast.warning(get(t)("toastNoCommand"));
			await log({
				level: "warn",
				callStack: new Error(),
				message: {
					context: "No wallpaper command configured",
				},
			});
			return;
		}

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
		toast.error(get(t)("toastCommandFailed"));

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
