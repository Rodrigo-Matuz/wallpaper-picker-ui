import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { t } from "$lib/lang/index";
import { resolveThemeAppearance } from "$lib/theme/appearance";
import { isThemeId } from "$lib/theme/registry";
import { publishThemeSelection, resolveThemeSelection } from "$lib/theme/theme";
import type { ThemeId } from "$types/themeTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";

/** Persists and immediately applies a theme family while retaining its current mode. */
export async function setThemeFamily(themeId: ThemeId): Promise<boolean> {
	if (!isThemeId(themeId)) return false;
	let release: (() => void) | undefined;
	try {
		release = applicationWork.beginWork();
		const config = await fetchConfig();
		const current = resolveThemeSelection(config);
		const appearance = resolveThemeAppearance(config);
		const selection = { ...current, themeId };
		if (
			!(await updateConfig({
				darkMode: selection.mode === "dark",
				themeId: selection.themeId,
				themeMode: selection.mode,
				themeRoundness: appearance.roundness,
				themeShadowStrength: appearance.shadowStrength,
				themeSpacing: appearance.spacing,
			}))
		) {
			toast.error(get(t)("toast.settings.failed"));
			return false;
		}
		publishThemeSelection(selection);
		return true;
	} catch {
		toast.error(get(t)("toast.settings.failed"));
		return false;
	} finally {
		release?.();
	}
}
