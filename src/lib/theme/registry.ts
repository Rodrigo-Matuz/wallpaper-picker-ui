import type { ThemeDefinition, ThemeId, ThemeVariant } from "$types/themeTypes";

const deepOceanDark: ThemeVariant = {
	colors: {
		background: "#030a14",
		surface: "#010a17",
		surfaceRaised: "#001029",
		surfaceHover: "#073887",
		border: "#001330",
		foreground: "#f5f5f5",
		muted: "#a1a1aa",
		subtle: "#71717a",
		primary: "#1e65ff",
		secondary: "#702ef3",
		accent: "#fc1a70",
		warning: "#ff4d00",
		highlight: "#ffff87",
		success: "#a4e400",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: {
		buttonRadius: "4px",
		controlRadius: "4px",
		cardRadius: "6px",
		shadow: "0 14px 34px rgb(0 0 0 / 0.24)",
		buttonShadow: "0 4px 14px rgb(0 0 0 / 0.2)",
		pagePadding: "20px",
		sectionGap: "48px",
		gridGap: "12px",
		controlGap: "12px",
		rowPaddingX: "24px",
		rowPaddingY: "24px",
	},
};

const deepOceanLight: ThemeVariant = {
	colors: {
		background: "#f5f8fd",
		surface: "#ffffff",
		surfaceRaised: "#eaf0fa",
		surfaceHover: "#dbe7ff",
		border: "#c7d3e6",
		foreground: "#111827",
		muted: "#526070",
		subtle: "#718096",
		primary: "#155eef",
		secondary: "#6941c6",
		accent: "#d92d75",
		warning: "#d92d20",
		highlight: "#c99500",
		success: "#4f8f00",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: deepOceanDark.geometry,
};

const emberDark: ThemeVariant = {
	colors: {
		background: "#160d0a",
		surface: "#21110d",
		surfaceRaised: "#32170f",
		surfaceHover: "#6b2c19",
		border: "#4a2116",
		foreground: "#fff5ed",
		muted: "#d1aaa0",
		subtle: "#9e7164",
		primary: "#ff8a3d",
		secondary: "#f35b8f",
		accent: "#ff4d4d",
		warning: "#ffb347",
		highlight: "#ffd166",
		success: "#a7d46f",
		accentForeground: "#2b0d08",
		primaryForeground: "#2b0d08",
	},
	geometry: {
		buttonRadius: "999px",
		controlRadius: "12px",
		cardRadius: "16px",
		shadow: "0 18px 42px rgb(0 0 0 / 0.3)",
		buttonShadow: "0 6px 18px rgb(0 0 0 / 0.26)",
		pagePadding: "24px",
		sectionGap: "56px",
		gridGap: "16px",
		controlGap: "16px",
		rowPaddingX: "28px",
		rowPaddingY: "28px",
	},
};

const emberLight: ThemeVariant = {
	colors: {
		background: "#fff8f3",
		surface: "#ffffff",
		surfaceRaised: "#fff0e7",
		surfaceHover: "#ffe0cc",
		border: "#f0cdbb",
		foreground: "#2d1b16",
		muted: "#76594e",
		subtle: "#9d7c6d",
		primary: "#d95f16",
		secondary: "#c23b72",
		accent: "#d83b3b",
		warning: "#bd6500",
		highlight: "#a86f00",
		success: "#568b24",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: emberDark.geometry,
};

const meadowDark: ThemeVariant = {
	colors: {
		background: "#07130f",
		surface: "#0b1d16",
		surfaceRaised: "#103022",
		surfaceHover: "#1a5435",
		border: "#1c3e2b",
		foreground: "#f0fff7",
		muted: "#a6c8b5",
		subtle: "#6f9b80",
		primary: "#36c275",
		secondary: "#60a5fa",
		accent: "#d6f36a",
		warning: "#f1b75b",
		highlight: "#f4e285",
		success: "#63e6be",
		accentForeground: "#10210f",
		primaryForeground: "#062014",
	},
	geometry: {
		buttonRadius: "2px",
		controlRadius: "3px",
		cardRadius: "2px",
		shadow: "0 10px 26px rgb(0 0 0 / 0.22)",
		buttonShadow: "0 3px 10px rgb(0 0 0 / 0.18)",
		pagePadding: "18px",
		sectionGap: "40px",
		gridGap: "10px",
		controlGap: "10px",
		rowPaddingX: "22px",
		rowPaddingY: "20px",
	},
};

const meadowLight: ThemeVariant = {
	colors: {
		background: "#f4fbf6",
		surface: "#ffffff",
		surfaceRaised: "#e9f6ed",
		surfaceHover: "#d5efdc",
		border: "#bddbc5",
		foreground: "#14251b",
		muted: "#567363",
		subtle: "#789582",
		primary: "#16834d",
		secondary: "#3978c9",
		accent: "#6d8f00",
		warning: "#a66b00",
		highlight: "#9a7d00",
		success: "#177c59",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: meadowDark.geometry,
};

const arcticDark: ThemeVariant = {
	colors: {
		background: "#06141f",
		surface: "#0b2230",
		surfaceRaised: "#123447",
		surfaceHover: "#1d5b72",
		border: "#1c4a5b",
		foreground: "#e9fbff",
		muted: "#9ac4d0",
		subtle: "#6e98a6",
		primary: "#50d7ff",
		secondary: "#7ca8ff",
		accent: "#b9f3ff",
		warning: "#ffad66",
		highlight: "#d7f8ff",
		success: "#72e0ad",
		accentForeground: "#06202a",
		primaryForeground: "#06202a",
	},
	geometry: {
		buttonRadius: "6px",
		controlRadius: "8px",
		cardRadius: "10px",
		shadow: "0 16px 36px rgb(0 19 30 / 0.28)",
		buttonShadow: "0 5px 16px rgb(0 19 30 / 0.22)",
		pagePadding: "22px",
		sectionGap: "48px",
		gridGap: "14px",
		controlGap: "14px",
		rowPaddingX: "24px",
		rowPaddingY: "24px",
	},
};

const arcticLight: ThemeVariant = {
	colors: {
		background: "#f1fbfe",
		surface: "#ffffff",
		surfaceRaised: "#e3f5fa",
		surfaceHover: "#ccecf4",
		border: "#b5dce5",
		foreground: "#102a33",
		muted: "#51727c",
		subtle: "#7897a0",
		primary: "#087f9f",
		secondary: "#4f70bf",
		accent: "#007a8f",
		warning: "#bf5a16",
		highlight: "#a05f00",
		success: "#207d59",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: arcticDark.geometry,
};

const orchidDark: ThemeVariant = {
	colors: {
		background: "#130b1b",
		surface: "#21112d",
		surfaceRaised: "#341946",
		surfaceHover: "#63336e",
		border: "#4d285c",
		foreground: "#fff2ff",
		muted: "#d0afcf",
		subtle: "#9b779c",
		primary: "#d58aff",
		secondary: "#8f7cff",
		accent: "#ff77c8",
		warning: "#ff9e68",
		highlight: "#ffd1f0",
		success: "#8fe3b0",
		accentForeground: "#2a0e27",
		primaryForeground: "#2a0e27",
	},
	geometry: {
		buttonRadius: "999px",
		controlRadius: "14px",
		cardRadius: "20px",
		shadow: "0 20px 48px rgb(25 5 35 / 0.32)",
		buttonShadow: "0 8px 20px rgb(25 5 35 / 0.26)",
		pagePadding: "26px",
		sectionGap: "60px",
		gridGap: "18px",
		controlGap: "18px",
		rowPaddingX: "30px",
		rowPaddingY: "30px",
	},
};

const orchidLight: ThemeVariant = {
	colors: {
		background: "#fff7fd",
		surface: "#ffffff",
		surfaceRaised: "#f8e8f6",
		surfaceHover: "#f3d6ed",
		border: "#e7c2df",
		foreground: "#2a1729",
		muted: "#76556f",
		subtle: "#9b7b94",
		primary: "#a83bd1",
		secondary: "#6554c0",
		accent: "#d5298f",
		warning: "#b44e13",
		highlight: "#9f5a00",
		success: "#2f8b5d",
		accentForeground: "#ffffff",
		primaryForeground: "#ffffff",
	},
	geometry: orchidDark.geometry,
};

export const themes: Record<ThemeId, ThemeDefinition> = {
	"deep-ocean": {
		id: "deep-ocean",
		label: "DeepOcean",
		variants: { dark: deepOceanDark, light: deepOceanLight },
	},
	ember: {
		id: "ember",
		label: "Ember",
		variants: { dark: emberDark, light: emberLight },
	},
	meadow: {
		id: "meadow",
		label: "Meadow",
		variants: { dark: meadowDark, light: meadowLight },
	},
	arctic: {
		id: "arctic",
		label: "Arctic",
		variants: { dark: arcticDark, light: arcticLight },
	},
	orchid: {
		id: "orchid",
		label: "Orchid",
		variants: { dark: orchidDark, light: orchidLight },
	},
};

export const themeIds = Object.keys(themes) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === "string" && Object.hasOwn(themes, value);
}

export function getThemeVariant(themeId: ThemeId, mode: "dark" | "light"): ThemeVariant {
	return themes[themeId].variants[mode];
}
