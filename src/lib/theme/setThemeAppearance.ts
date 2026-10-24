import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { t } from "$lib/lang/index";
import {
	isThemeRoundnessValue,
	isThemeShadowStrengthValue,
	isThemeSpacingValue,
	publishThemeAppearance,
	resolveThemeAppearance,
} from "$lib/theme/appearance";
import type {
	ThemeAppearanceSelection,
	ThemeRoundness,
	ThemeShadowStrength,
	ThemeSpacing,
} from "$types/themeTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";

export type ThemeAppearancePatch = Partial<ThemeAppearanceSelection>;

function isValidPatch(patch: ThemeAppearancePatch): boolean {
	return (
		(patch.roundness === undefined || isThemeRoundnessValue(patch.roundness)) &&
		(patch.shadowStrength === undefined || isThemeShadowStrengthValue(patch.shadowStrength)) &&
		(patch.spacing === undefined || isThemeSpacingValue(patch.spacing))
	);
}

/** Persists and immediately applies the visual settings independently from colors. */
export async function setThemeAppearance(patch: ThemeAppearancePatch): Promise<boolean> {
	if (!isValidPatch(patch)) return false;

	let release: (() => void) | undefined;
	try {
		release = applicationWork.beginWork();
		const config = await fetchConfig();
		const current = resolveThemeAppearance(config);
		const appearance: ThemeAppearanceSelection = { ...current, ...patch };
		if (
			!(await updateConfig({
				themeRoundness: appearance.roundness,
				themeShadowStrength: appearance.shadowStrength,
				themeSpacing: appearance.spacing,
			}))
		) {
			toast.error(get(t)("toast.settings.failed"));
			return false;
		}
		publishThemeAppearance(appearance);
		return true;
	} catch {
		toast.error(get(t)("toast.settings.failed"));
		return false;
	} finally {
		release?.();
	}
}

export type { ThemeRoundness, ThemeShadowStrength, ThemeSpacing };
