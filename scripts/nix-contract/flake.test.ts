import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const flake = readFileSync(new URL("../../flake.nix", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

test("exposes independent theme appearance settings through Home Manager", () => {
	expect(flake).toContain("themeRoundness");
	expect(flake).toContain("themeShadowStrength");
	expect(flake).toContain("themeSpacing");

	expect(flake).toContain('[ "sharp" "soft" "rounded" "pill" ]');
	expect(flake).toContain('[ "none" "subtle" "strong" ]');
	expect(flake).toContain('[ "compact" "comfortable" "spacious" ]');

	const initialConfig = flake.slice(
		flake.indexOf("initialConfig ="),
		flake.indexOf("in\n        {"),
	);
	expect(initialConfig).toContain("themeRoundness");
	expect(initialConfig).toContain("themeShadowStrength");
	expect(initialConfig).toContain("themeSpacing");
});

test("documents the Home Manager appearance settings", () => {
	for (const option of ["themeRoundness", "themeShadowStrength", "themeSpacing"]) {
		expect(readme).toContain(option);
	}
});
