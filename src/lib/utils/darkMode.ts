import { setMode } from "mode-watcher";
import { fetchConfig } from "$api/config/read";
import { updateConfig } from "$api/config/update";
import { log } from "./logger";

/**
 * Toggles the application's dark mode setting.
 *
 * Reads the current configuration to determine the active color mode.
 * If dark mode is enabled, switches to light mode; otherwise, enables dark mode.
 * The new mode is applied immediately via `setMode` and persisted to the
 * application configuration.
 *
 * Any errors encountered during the process are caught and logged.
 *
 * @returns Resolves once the color mode has been updated and persisted.
 *
 * @example
 * ```ts
 * await darkMode();
 * ```
 */
export const toggleDarkMode = async (): Promise<void> => {
	try {
		const config = await fetchConfig();
		const isDarkMode = config.darkMode;

		const newMode = isDarkMode ? "light" : "dark";
		setMode(newMode);
		await updateConfig({ darkMode: !isDarkMode });

		await log({
			level: "info",
			callStack: new Error(),
			message: {
				context: "Dark mode toggled",
				error: newMode,
			},
		});
	} catch (error) {
		await log({
			level: "error",
			message: {
				context: "Failed to toggle dark mode",
				error,
			},
			callStack: error instanceof Error ? error : new Error("Unknown error"),
		});
	}
};
