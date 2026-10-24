import { setMode } from "mode-watcher";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { t } from "$lang/index";
import { resolveThemeAppearance } from "$lib/theme/appearance";
import { publishThemeSelection, resolveThemeSelection } from "$lib/theme/theme";
import type { ThemeMode } from "$types/themeTypes";
import { applicationWork, InstallationReservedError } from "$utils/applicationWork/applicationWork";
import { log } from "./logger/logger";

/**
 * Toggles the application's dark mode setting.
 *
 * Reads the current configuration to determine the active color mode.
 * If dark mode is enabled, switches to light mode; otherwise, enables dark mode.
 * The new mode is applied via `setMode` only after confirmed persistence.
 *
 * Any errors encountered during the process are caught and logged.
 *
 * @returns True after persistence and publication; false on reported failure/denial.
 *          Existing diagnostic failures may still reject; Settings consumes rejections.
 *
 * @example
 * ```ts
 * await darkMode();
 * ```
 */
export const toggleDarkMode = async (): Promise<boolean> => {
	let release: (() => void) | undefined;
	try {
		release = applicationWork.beginWork();
		const config = await fetchConfig();
		const currentSelection = resolveThemeSelection(config);
		const appearance = resolveThemeAppearance(config);
		const newMode: ThemeMode = currentSelection.mode === "dark" ? "light" : "dark";
		const newSelection = { ...currentSelection, mode: newMode };
		if (
			!(await updateConfig({
				darkMode: newMode === "dark",
				themeId: newSelection.themeId,
				themeMode: newSelection.mode,
				themeRoundness: appearance.roundness,
				themeShadowStrength: appearance.shadowStrength,
				themeSpacing: appearance.spacing,
			}))
		) {
			toast.error(get(t)("toast.settings.failed"));
			return false;
		}
		publishThemeSelection(newSelection);
		setMode(newMode);

		await log({
			level: "info",
			callStack: new Error(),
			message: {
				context: "Dark mode toggled",
				error: newMode,
			},
		});
		return true;
	} catch (error) {
		toast.error(get(t)("toast.settings.failed"));
		if (error instanceof InstallationReservedError) return false;
		await log({
			level: "error",
			message: {
				context: "Failed to toggle dark mode",
				error,
			},
			callStack: error instanceof Error ? error : new Error("Unknown error"),
		});
		return false;
	} finally {
		release?.();
	}
};
