import { cleanup, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { get } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import { t } from "$lang/index";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import Display from "./display.svelte";

const effects = vi.hoisted(() => ({
	readMap: vi.fn(async () => ({})),
	fetchConfig: vi.fn(async () => ({ newWallpapers: false, thumbnailVersion: 1 })),
	invoke: vi.fn(async () => {}),
	log: vi.fn(async () => {}),
	errorToast: vi.fn(),
}));
vi.mock("$api/thumbnails/map/map", () => ({
	readThumbnailMap: effects.readMap,
	migrateThumbnailMapFromConfig: vi.fn(async () => ({})),
	writeThumbnailMap: vi.fn(),
}));
vi.mock("$api/config/read/read", () => ({ fetchConfig: effects.fetchConfig }));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
vi.mock("$api/system/execCommand/execCommand", () => ({ sendCommand: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: effects.invoke }));
vi.mock("$utils/logger/logger", () => ({ log: effects.log }));
vi.mock("svelte-sonner", () => ({ toast: { error: effects.errorToast, warning: vi.fn() } }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

test("Display reports other pipeline rejection through the existing translated toast", async () => {
	effects.readMap.mockRejectedValueOnce(new Error("map unreadable"));
	render(Display);
	await waitFor(() =>
		expect(effects.errorToast).toHaveBeenCalledWith(get(t)("toast.thumbnails.failed")),
	);
	expect(effects.errorToast).toHaveBeenCalledTimes(1);
	expect(effects.fetchConfig).not.toHaveBeenCalled();
	expect(effects.invoke).not.toHaveBeenCalled();
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("Display consumes reserved mount admission without native/config/log work or automatic retry", async () => {
	const reservation = applicationWork.tryReserveInstall();
	expect(reservation).not.toBeNull();
	try {
		render(Display);
		await waitFor(() =>
			expect(effects.errorToast).toHaveBeenCalledWith(get(t)("toast.thumbnails.failed")),
		);
		expect(effects.readMap).not.toHaveBeenCalled();
		expect(effects.fetchConfig).not.toHaveBeenCalled();
		expect(effects.invoke).not.toHaveBeenCalled();
		expect(effects.log).not.toHaveBeenCalled();
		reservation?.release();
		await tick();
		expect(effects.readMap).not.toHaveBeenCalled();
		expect(effects.errorToast).toHaveBeenCalledTimes(1);
	} finally {
		reservation?.release();
	}
});
