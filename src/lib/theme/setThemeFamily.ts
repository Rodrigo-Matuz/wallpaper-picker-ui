import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { t } from "$lib/lang/index";
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
		const current = resolveThemeSelection(await fetchConfig());
		const selection = { ...current, themeId };
		if (
			!(await updateConfig({
				darkMode: selection.mode === "dark",
				themeId: selection.themeId,
				themeMode: selection.mode,
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
