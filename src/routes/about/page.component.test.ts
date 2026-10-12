import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLanguage, languages, t } from "$lang/index";
import AboutPage from "./+page.svelte";

vi.stubGlobal("__APP_VERSION__", "3.5.0-test");
vi.mock("$config/contributors.json", () => ({
	default: {
		contributors: [
			{
				id: "matuz",
				name: "Matuz",
				githubUrl: "https://github.com/Rodrigo-Matuz",
				links: [{ id: "website", url: "https://matuz.dev", icon: "website" }],
			},
			{
				id: "another",
				name: "Another Contributor",
				githubUrl: "https://github.com/another",
				links: [],
			},
		],
	},
}));

afterEach(() => {
	cleanup();
	currentLanguage.set("eng");
	vi.unstubAllGlobals();
});

describe("About page", () => {
	it("shows the second updater test build marker for 3.6.3", () => {
		vi.stubGlobal("__APP_VERSION__", "3.6.3");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(AboutPage);
		expect(screen.getByText("Updater test: second build")).toBeTruthy();
	});

	it.each([
		"3.6.2",
		"3.5.0",
		"3.6.4",
		"4.0.0",
		"3.6.3-test",
	])("does not show the updater test marker for %s", (version) => {
		vi.stubGlobal("__APP_VERSION__", version);
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(AboutPage);
		expect(screen.getByText(version)).toBeTruthy();
		expect(screen.queryByText("Updater test: second build")).toBeNull();
		expect(screen.queryByText("about.updater.test.marker")).toBeNull();
	});

	it.each([
		["eng", "Updater test: second build"],
		["pt-br", "Teste de atualização: segunda versão de teste"],
		["es", "Prueba de actualización: segunda versión de prueba"],
		["fr", "Test de mise à jour : deuxième version de test"],
		["de", "Update-Test: zweiter Testbuild"],
	])("resolves and renders the updater test marker in %s", async (locale, expected) => {
		vi.stubGlobal("__APP_VERSION__", "3.6.3");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		expect(Object.keys(languages).sort()).toEqual(["de", "eng", "es", "fr", "pt-br"]);
		render(AboutPage);
		expect(screen.getByText("Updater test: second build")).toBeTruthy();
		currentLanguage.set(locale);
		expect(get(t)("about.updater.test.marker")).toBe(expected);
		expect(get(t)("about.updater.test.marker")).not.toBe("about.updater.test.marker");
		await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
		expect(screen.queryByText("about.updater.test.marker")).toBeNull();
		if (locale !== "eng") {
			expect(screen.queryByText("Updater test: second build")).toBeNull();
		}
	});

	it("mounts the updater panel near the installed version", () => {
		vi.stubGlobal("__APP_VERSION__", "3.5.0-test");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(AboutPage);
		expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Releases on GitHub" })).toBeTruthy();
	});
	it("renders every configured contributor without depending on a hardcoded owner", async () => {
		vi.stubGlobal("__APP_VERSION__", "3.5.0-test");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(AboutPage);
		expect(screen.getByRole("heading", { level: 1, name: "Wallpaper Picker UI" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Contributors" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Matuz" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Another Contributor" })).toBeTruthy();
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		expect(screen.getByText("3.5.0-test")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Back to wallpapers" }).getAttribute("href")).toBe(
			"/",
		);
		expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
			"/settings",
		);
		expect(screen.getByRole("link", { name: "Source code" }).getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui",
		);
	});

	it("separates the project website from contributors' personal websites", () => {
		vi.stubGlobal("__APP_VERSION__", "3.5.0-test");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		render(AboutPage);
		const profile = screen.getByRole("article", { name: "Matuz" });
		expect(within(profile).getByRole("link", { name: "Website" }).getAttribute("href")).toBe(
			"https://matuz.dev",
		);
		const projectSite = screen.getByRole("link", { name: "Project website" });
		expect(projectSite.getAttribute("href")).toBe(
			"https://matuz.dev/projects/wallpaper-picker",
		);
		expect(profile.contains(projectSite)).toBe(false);
		expect(screen.getByRole("link", { name: "Source code" }).getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui",
		);
	});
});
