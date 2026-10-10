import { open } from "@tauri-apps/plugin-dialog";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { updateConfig } from "$api/config/update/update";
import { t } from "$lang/index";
import { applicationWork, InstallationReservedError } from "$utils/applicationWork/applicationWork";
import { log } from "$utils/logger/logger";

/** DOCS:
 * Opens a native folder selection dialog (Tauri dialog plugin), logs the operation,
 * and updates the configuration with the selected folder path.
 *
 * Replaces the previous zenity (unix) / rfd (windows) shell-out with the
 * official plugin, which uses the platform's native dialog on all systems.
 *
 * @returns {Promise<string>} Resolves to the selected folder path, or an empty string
 *          when the dialog is cancelled or an error occurs.
 *
 * @example
 * ```ts
 * const folderPath = await selectFolder();
 * if (folderPath) await handleThumbnails(true);
 * ```
 */
export async function selectFolder(): Promise<string> {
	let release: (() => void) | undefined;
	try {
		// The native dialog is pending application work, not just its eventual write.
		release = applicationWork.beginWork();
		const selected = await open({
			directory: true,
			title: get(t)("home.folder.dialog.title"),
		});

		const folderPath = typeof selected === "string" ? selected : "";

		if (folderPath) {
			await log({
				level: "positive",
				callStack: new Error(),
				message: {
					context: "Folder selected successfully",
					path: folderPath,
				},
			});

			const persisted = await updateConfig({ wallpapersPath: folderPath });
			if (!persisted) throw new Error("Selected folder was not persisted");
		}

		return folderPath;
	} catch (error) {
		toast.error(get(t)("toast.folder.failed"));
		// Denial is UI-only: diagnostics must not attempt config repair during installation.
		if (error instanceof InstallationReservedError) return "";
		await log({
			level: "error",
			callStack: new Error(),
			message: {
				context: "Failed to select folder",
				error,
			},
		});

		return "";
	} finally {
		release?.();
	}
}
