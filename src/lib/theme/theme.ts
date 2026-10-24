import { writable } from "svelte/store";
import type { ConfigInterArgs } from "$types/configTypes";
import type { ThemeMode, ThemeSelection } from "$types/themeTypes";
import {
	applyThemeAppearance,
	initializeThemeAppearance,
	publishThemeAppearance,
} from "./appearance";
import { getThemeVariant, isThemeId } from "./registry";

export {
	defaultThemeAppearance,
	resolveThemeAppearance,
	themeAppearance,
} from "./appearance";

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
}

export function initializeTheme(config?: Partial<ConfigInterArgs>): ThemeSelection {
	const selection = resolveThemeSelection(config);
	themeSelection.set(selection);
	applyThemeSelection(selection);
	initializeThemeAppearance(config);
	return selection;
}

export function publishThemeSelection(selection: ThemeSelection): void {
	themeSelection.set(selection);
	applyThemeSelection(selection);
}

export { applyThemeAppearance, publishThemeAppearance };
