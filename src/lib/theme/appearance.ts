import { writable } from "svelte/store";
import type { ConfigInterArgs } from "$types/configTypes";
import type {
	ThemeAppearanceSelection,
	ThemeGeometry,
	ThemeId,
	ThemeRoundness,
	ThemeShadowStrength,
	ThemeSpacing,
} from "$types/themeTypes";
import { isThemeId } from "./registry";

export const defaultThemeAppearance: ThemeAppearanceSelection = {
	roundness: "sharp",
	shadowStrength: "subtle",
	spacing: "comfortable",
};

export const themeAppearance = writable<ThemeAppearanceSelection>(defaultThemeAppearance);

const legacyThemeAppearance: Record<ThemeId, ThemeAppearanceSelection> = {
	"deep-ocean": { roundness: "sharp", shadowStrength: "subtle", spacing: "comfortable" },
	ember: { roundness: "pill", shadowStrength: "strong", spacing: "spacious" },
	meadow: { roundness: "sharp", shadowStrength: "subtle", spacing: "compact" },
	arctic: { roundness: "soft", shadowStrength: "strong", spacing: "comfortable" },
	orchid: { roundness: "pill", shadowStrength: "strong", spacing: "spacious" },
};

const roundnessGeometry: Record<
	ThemeRoundness,
	Pick<ThemeGeometry, "buttonRadius" | "controlRadius" | "cardRadius">
> = {
	sharp: { buttonRadius: "4px", controlRadius: "4px", cardRadius: "6px" },
	soft: { buttonRadius: "6px", controlRadius: "8px", cardRadius: "10px" },
	rounded: { buttonRadius: "10px", controlRadius: "14px", cardRadius: "18px" },
	pill: { buttonRadius: "999px", controlRadius: "999px", cardRadius: "24px" },
};

const shadowGeometry: Record<
	ThemeShadowStrength,
	Pick<ThemeGeometry, "shadow" | "buttonShadow">
> = {
	none: { shadow: "none", buttonShadow: "none" },
	subtle: {
		shadow: "0 14px 34px rgb(0 0 0 / 0.24)",
		buttonShadow: "0 4px 14px rgb(0 0 0 / 0.2)",
	},
	strong: {
		shadow: "0 20px 48px rgb(0 0 0 / 0.32)",
		buttonShadow: "0 8px 20px rgb(0 0 0 / 0.28)",
	},
};

const spacingGeometry: Record<
	ThemeSpacing,
	Pick<
		ThemeGeometry,
		"pagePadding" | "sectionGap" | "gridGap" | "controlGap" | "rowPaddingX" | "rowPaddingY"
	>
> = {
	compact: {
		pagePadding: "18px",
		sectionGap: "40px",
		gridGap: "10px",
		controlGap: "10px",
		rowPaddingX: "20px",
		rowPaddingY: "20px",
	},
	comfortable: {
		pagePadding: "20px",
		sectionGap: "48px",
		gridGap: "12px",
		controlGap: "12px",
		rowPaddingX: "24px",
		rowPaddingY: "24px",
	},
	spacious: {
		pagePadding: "26px",
		sectionGap: "60px",
		gridGap: "18px",
		controlGap: "18px",
		rowPaddingX: "30px",
		rowPaddingY: "30px",
	},
};

const cssVariableGroups = {
	buttonRadius: "--theme-button-radius",
	controlRadius: "--theme-control-radius",
	cardRadius: "--theme-card-radius",
	shadow: "--theme-shadow",
	buttonShadow: "--theme-button-shadow",
	pagePadding: "--theme-page-padding",
	sectionGap: "--theme-section-gap",
	gridGap: "--theme-grid-gap",
	controlGap: "--theme-control-gap",
	rowPaddingX: "--theme-row-padding-x",
	rowPaddingY: "--theme-row-padding-y",
} as const;

function isThemeRoundness(value: unknown): value is ThemeRoundness {
	return value === "sharp" || value === "soft" || value === "rounded" || value === "pill";
}

function isThemeShadowStrength(value: unknown): value is ThemeShadowStrength {
	return value === "none" || value === "subtle" || value === "strong";
}

function isThemeSpacing(value: unknown): value is ThemeSpacing {
	return value === "compact" || value === "comfortable" || value === "spacious";
}

export function resolveThemeAppearance(
	config?: Partial<ConfigInterArgs>,
): ThemeAppearanceSelection {
	const legacy = isThemeId(config?.themeId)
		? legacyThemeAppearance[config.themeId]
		: defaultThemeAppearance;

	return {
		roundness: isThemeRoundness(config?.themeRoundness)
			? config.themeRoundness
			: legacy.roundness,
		shadowStrength: isThemeShadowStrength(config?.themeShadowStrength)
			? config.themeShadowStrength
			: legacy.shadowStrength,
		spacing: isThemeSpacing(config?.themeSpacing) ? config.themeSpacing : legacy.spacing,
	};
}

export function getThemeGeometry(appearance: ThemeAppearanceSelection): ThemeGeometry {
	return {
		...roundnessGeometry[appearance.roundness],
		...shadowGeometry[appearance.shadowStrength],
		...spacingGeometry[appearance.spacing],
	};
}

export function applyThemeAppearance(appearance: ThemeAppearanceSelection): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const geometry = getThemeGeometry(appearance);

	for (const [key, cssVariable] of Object.entries(cssVariableGroups)) {
		root.style.setProperty(cssVariable, geometry[key as keyof typeof geometry]);
	}
}

export function initializeThemeAppearance(
	config?: Partial<ConfigInterArgs>,
): ThemeAppearanceSelection {
	const appearance = resolveThemeAppearance(config);
	themeAppearance.set(appearance);
	applyThemeAppearance(appearance);
	return appearance;
}

export function publishThemeAppearance(appearance: ThemeAppearanceSelection): void {
	themeAppearance.set(appearance);
	applyThemeAppearance(appearance);
}

export function isThemeRoundnessValue(value: unknown): value is ThemeRoundness {
	return isThemeRoundness(value);
}

export function isThemeShadowStrengthValue(value: unknown): value is ThemeShadowStrength {
	return isThemeShadowStrength(value);
}

export function isThemeSpacingValue(value: unknown): value is ThemeSpacing {
	return isThemeSpacing(value);
}
