import { afterEach, describe, expect, test } from "vitest";
import { applyThemeAppearance } from "./appearance";
import { applyThemeSelection } from "./theme";

describe("theme runtime", () => {
	afterEach(() => {
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.removeAttribute("data-theme-mode");
		document.documentElement.removeAttribute("style");
	});

	test("publishes the selected family, mode, and token variables", () => {
		applyThemeAppearance({ roundness: "pill", shadowStrength: "none", spacing: "compact" });
		applyThemeSelection({ themeId: "ember", mode: "light" });

		expect(document.documentElement.dataset.theme).toBe("ember");
		expect(document.documentElement.dataset.themeMode).toBe("light");
		expect(document.documentElement.style.getPropertyValue("--theme-primary")).toBe("#d95f16");
		expect(document.documentElement.style.getPropertyValue("--theme-button-radius")).toBe(
			"999px",
		);
		expect(document.documentElement.style.getPropertyValue("--theme-shadow")).toBe("none");
		expect(document.documentElement.style.getPropertyValue("--theme-grid-gap")).toBe("10px");
	});
});
