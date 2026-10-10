import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateConfig } from "$api/config/update/update";
import { thumbnails, thumbnailsGenerated, totalVideos } from "$api/thumbnails/handle";
import HomePage from "./+page.svelte";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/config/read/read", () => ({
	fetchConfig: vi.fn(async () => ({ language: "eng" })),
}));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn(async () => {}) }));
vi.mock("$lib/api/system/selectFolder/selectFolder", () => ({
	selectFolder: vi.fn(async () => ""),
}));
vi.mock("$api/system/execCommand/execCommand", () => ({ sendCommand: vi.fn() }));
vi.mock("$api/thumbnails/handle", () => ({
	thumbnails: writable<Record<string, string>>({}),
	thumbnailsGenerated: writable(0),
	totalVideos: writable(0),
	handleThumbnails: vi.fn(async () => {}),
}));

afterEach(() => {
	cleanup();
	thumbnails.set({});
	thumbnailsGenerated.set(0);
	totalVideos.set(0);
});

describe("Home footer", () => {
	it("does not persist language merely while loading the stored configuration", async () => {
		vi.mocked(updateConfig).mockClear();
		render(HomePage);
		await screen.findByPlaceholderText("Search Wallpapers...");
		expect(updateConfig).not.toHaveBeenCalled();
	});
	it("appears only when the filtered wallpaper grid has no items", async () => {
		thumbnails.set({ "data:image/png;base64,": "/wallpapers/forest.mp4" });
		render(HomePage);
		await screen.findByRole("img", { name: "/wallpapers/forest.mp4" });
		expect(screen.queryByRole("contentinfo")).toBeNull();
		const search = screen.getByPlaceholderText("Search Wallpapers...");
		await fireEvent.input(search, { target: { value: "ocean" } });
		await waitFor(() => expect(screen.getByRole("contentinfo")).toBeTruthy());
		await fireEvent.input(search, { target: { value: "forest" } });
		await waitFor(() => expect(screen.queryByRole("contentinfo")).toBeNull());
		thumbnails.set({});
		await waitFor(() => expect(screen.getByRole("contentinfo")).toBeTruthy());
	});

	it("shows while generation replaces the grid, then hides when the grid returns", async () => {
		thumbnails.set({ "data:image/png;base64,": "/wallpapers/forest.mp4" });
		totalVideos.set(2);
		render(HomePage);
		await screen.findByRole("progressbar");
		expect(screen.getByRole("contentinfo")).toBeTruthy();
		thumbnailsGenerated.set(2);
		await screen.findByRole("img", { name: "/wallpapers/forest.mp4" });
		await waitFor(() => expect(screen.queryByRole("contentinfo")).toBeNull());
	});
});
