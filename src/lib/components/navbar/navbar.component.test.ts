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
});
