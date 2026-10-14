import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "./navbar.svelte";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

afterEach(cleanup);

describe("Home header", () => {
	it("keeps search and settings, but moves folder selection out of the header", async () => {
		const onInputChange = vi.fn();
		render(Navbar, { onInputChange, inputPlaceholder: "Search Wallpapers..." });
		expect(screen.getByRole("heading", { name: "Wallpaper Picker UI" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
			"/settings",
		);
		expect(screen.queryByRole("button", { name: /folder/i })).toBeNull();
		const search = screen.getByRole("searchbox", { name: "Search Wallpapers..." });
		await fireEvent.input(search, { target: { value: "forest" } });
		expect(onInputChange).toHaveBeenCalledTimes(1);
		expect((onInputChange.mock.calls[0][0] as Event).target).toBe(search);
	});

	it("places search beside settings in one header row", () => {
		render(Navbar, { inputPlaceholder: "Search Wallpapers..." });
		const header = screen.getByRole("banner");
		const row = screen
			.getByRole("searchbox", { name: "Search Wallpapers..." })
			.closest("[data-header-row]");
		expect(row).toBeTruthy();
		expect(row?.contains(screen.getByRole("link", { name: "Settings" }))).toBe(true);
		expect(header.querySelector("nav")?.children.length).toBe(1);
	});

	it("keeps the brand label on one line at the default window width", () => {
		render(Navbar, { inputPlaceholder: "Search Wallpapers..." });
		const brandLabel = screen.getByText("Wallpaper / Picker");
		expect(brandLabel.classList.contains("whitespace-nowrap")).toBe(true);
	});

	it("opens a placeholder monitor panel and closes it", async () => {
		render(Navbar, { inputPlaceholder: "Search Wallpapers..." });
		const trigger = screen.getByRole("button", { name: "Monitor settings" });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("complementary", { name: "Monitor settings" })).toBeNull();
		await fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByRole("complementary", { name: "Monitor settings" })).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Close monitor settings" })).toHaveLength(1);
		expect(screen.getByText("Monitor selection is coming soon.")).toBeTruthy();
		await fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("complementary", { name: "Monitor settings" })).toBeNull();
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);
	});

	it("uses the search field border as its focus indicator instead of an offset input outline", () => {
		render(Navbar, { inputPlaceholder: "Search Wallpapers..." });
		const input = screen.getByRole("searchbox", { name: "Search Wallpapers..." });
		expect(input.hasAttribute("data-home-search")).toBe(true);
		expect(input.closest("label")?.classList.contains("focus-within:border-primary")).toBe(
			true,
		);
	});
});
