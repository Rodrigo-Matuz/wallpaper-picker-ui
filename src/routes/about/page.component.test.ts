import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
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
	vi.unstubAllGlobals();
});

describe("About page", () => {
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
