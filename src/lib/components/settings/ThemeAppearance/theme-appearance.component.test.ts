import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { themeAppearance } from "$lib/theme/appearance";
import ThemeAppearance from "./theme-appearance.svelte";

const { setThemeAppearance } = vi.hoisted(() => ({
	setThemeAppearance: vi.fn(async () => true),
}));
vi.mock("$lib/theme/setThemeAppearance", () => ({ setThemeAppearance }));

afterEach(() => {
	cleanup();
	setThemeAppearance.mockClear();
	themeAppearance.set({ roundness: "sharp", shadowStrength: "subtle", spacing: "comfortable" });
});

describe("ThemeAppearance", () => {
	it("renders independent global appearance controls", () => {
		render(ThemeAppearance);

		expect(screen.getByRole("button", { name: "Roundness" }).textContent).toContain("Sharp");
		expect(screen.getByRole("button", { name: "Shadow strength" }).textContent).toContain(
			"Subtle",
		);
		expect(screen.getByRole("button", { name: "Spacing" }).textContent).toContain(
			"Comfortable",
		);
	});
});
