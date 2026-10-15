import { writable } from "svelte/store";
import type { ConfigInterArgs } from "$types/configTypes";
import type { ThemeMode, ThemeSelection } from "$types/themeTypes";
import { getThemeVariant, isThemeId } from "./registry";

export const defaultThemeSelection: ThemeSelection = {
	themeId: "deep-ocean",
	mode: "dark",
};

export const themeSelection = writable<ThemeSelection>(defaultThemeSelection);

const cssVariableGroups = {
	colors: {
		background: "--theme-background",
		surface: "--theme-surface",
		surfaceRaised: "--theme-surface-raised",
		surfaceHover: "--theme-surface-hover",
		border: "--theme-border",
		foreground: "--theme-foreground",
		muted: "--theme-muted",
		subtle: "--theme-subtle",
		primary: "--theme-primary",
		secondary: "--theme-secondary",
		accent: "--theme-accent",
		warning: "--theme-warning",
		highlight: "--theme-highlight",
		success: "--theme-success",
		accentForeground: "--theme-accent-foreground",
		primaryForeground: "--theme-primary-foreground",
	},
	geometry: {
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
	},
} as const;

export function resolveThemeSelection(config?: Partial<ConfigInterArgs>): ThemeSelection {
	const themeId = isThemeId(config?.themeId) ? config.themeId : defaultThemeSelection.themeId;
	const mode: ThemeMode =
		config?.themeMode === "light" || config?.themeMode === "dark"
			? config.themeMode
			: config?.darkMode === false
				? "light"
				: defaultThemeSelection.mode;
	return { themeId, mode };
}

export function applyThemeSelection(selection: ThemeSelection): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const variant = getThemeVariant(selection.themeId, selection.mode);
	root.dataset.theme = selection.themeId;
	root.dataset.themeMode = selection.mode;

	for (const [key, cssVariable] of Object.entries(cssVariableGroups.colors)) {
		root.style.setProperty(cssVariable, variant.colors[key as keyof typeof variant.colors]);
	}
	for (const [key, cssVariable] of Object.entries(cssVariableGroups.geometry)) {
		root.style.setProperty(cssVariable, variant.geometry[key as keyof typeof variant.geometry]);
	}
}

export function initializeTheme(config?: Partial<ConfigInterArgs>): ThemeSelection {
	const selection = resolveThemeSelection(config);
	themeSelection.set(selection);
	applyThemeSelection(selection);
	return selection;
}

export function publishThemeSelection(selection: ThemeSelection): void {
	themeSelection.set(selection);
	applyThemeSelection(selection);
}
