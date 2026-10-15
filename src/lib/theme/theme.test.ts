import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import { defaultConfig } from "$api/config/defaults";
import { getThemeVariant, themeIds, themes } from "./registry";
import { defaultThemeSelection, resolveThemeSelection, themeSelection } from "./theme";

describe("theme selection", () => {
	test("keeps the current DeepOcean dark theme as the default", () => {
		expect(resolveThemeSelection(defaultConfig)).toEqual(defaultThemeSelection);
		expect(getThemeVariant("deep-ocean", "dark").colors.background).toBe("#030a14");
	});

	test("migrates an older darkMode false config to the light variant", () => {
		expect(resolveThemeSelection({ darkMode: false })).toEqual({
			themeId: "deep-ocean",
			mode: "light",
		});
	});

	test("rejects unknown persisted theme values", () => {
		expect(
			resolveThemeSelection({ themeId: "unknown" as never, themeMode: "neon" as never }),
		).toEqual(defaultThemeSelection);
		expect(resolveThemeSelection({ themeId: "toString" as never })).toEqual(
			defaultThemeSelection,
		);
	});

	test("prefers an explicit theme mode over the legacy darkMode field", () => {
		expect(
			resolveThemeSelection({ themeId: "ember", themeMode: "light", darkMode: true }),
		).toEqual({
			themeId: "ember",
			mode: "light",
		});
	});

	test("registers dark and light variants with complete token groups", () => {
		expect(themeIds).toEqual(["deep-ocean", "ember", "meadow"]);
		for (const themeId of themeIds) {
			for (const mode of ["dark", "light"] as const) {
				const variant = themes[themeId].variants[mode];
				expect(Object.keys(variant.colors)).toHaveLength(16);
				expect(Object.keys(variant.geometry)).toHaveLength(11);
			}
		}
	});

	test("exposes a reactive selection store", () => {
		expect(get(themeSelection)).toEqual(defaultThemeSelection);
	});
});
