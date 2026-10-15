import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import WindowsPlaybackNotice from "./windows-playback-notice.svelte";

afterEach(() => cleanup());

describe("Windows playback notice", () => {
	it("explains the mpv requirement on Windows", () => {
		render(WindowsPlaybackNotice, {
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		});

		expect(
			screen.getByRole("complementary", { name: "Windows playback requires mpv" }),
		).toBeTruthy();
		expect(screen.getByText(/Install mpv and make sure it is available on PATH/)).toBeTruthy();
		expect(screen.getByRole("link", { name: "Install mpv" }).getAttribute("href")).toBe(
			"https://mpv.io/installation/",
		);
	});

	it("stays hidden on non-Windows platforms", () => {
		render(WindowsPlaybackNotice, {
			userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
		});

		expect(screen.queryByRole("complementary")).toBeNull();
	});
});
