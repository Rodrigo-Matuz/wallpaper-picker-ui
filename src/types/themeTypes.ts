export type ThemeId = "deep-ocean" | "ember" | "meadow" | "arctic" | "orchid";
export type ThemeMode = "dark" | "light";

export interface ThemeColors {
	background: string;
	surface: string;
	surfaceRaised: string;
	surfaceHover: string;
	border: string;
	foreground: string;
	muted: string;
	subtle: string;
	primary: string;
	secondary: string;
	accent: string;
	warning: string;
	highlight: string;
	success: string;
	accentForeground: string;
	primaryForeground: string;
}

export interface ThemeGeometry {
	buttonRadius: string;
	controlRadius: string;
	cardRadius: string;
	shadow: string;
	buttonShadow: string;
	pagePadding: string;
	sectionGap: string;
	gridGap: string;
	controlGap: string;
	rowPaddingX: string;
	rowPaddingY: string;
}

export interface ThemeVariant {
	colors: ThemeColors;
	geometry: ThemeGeometry;
}

export interface ThemeDefinition {
	id: ThemeId;
	label: string;
	variants: Record<ThemeMode, ThemeVariant>;
}

export interface ThemeSelection {
	themeId: ThemeId;
	mode: ThemeMode;
}
