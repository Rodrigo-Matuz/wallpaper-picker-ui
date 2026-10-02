import { afterEach, describe, expect, mock, test } from "bun:test";
import { writable } from "svelte/store";

const open = mock(async (_options: object): Promise<string | null> => "/videos");
const updateConfig = mock(async (_config: object) => {});
const log = mock(async () => {});
mock.module("@tauri-apps/plugin-dialog", () => ({ open }));
mock.module("$api/config/update/update", () => ({ updateConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("$lang/index", () => ({ t: writable((key: string) => key) }));
const { selectFolder } = await import("./selectFolder");

afterEach(() => {
	open.mockReset();
	open.mockImplementation(async () => "/videos");
	updateConfig.mockReset();
	updateConfig.mockImplementation(async () => {});
	log.mockClear();
});

describe("selectFolder", () => {
	test("opens directory picker with translated title and persists selection", async () => {
		expect(await selectFolder()).toBe("/videos");
		expect(open).toHaveBeenCalledWith({ directory: true, title: "home.folder.dialog.title" });
		expect(updateConfig).toHaveBeenCalledWith({ wallpapersPath: "/videos" });
	});
	test("cancel leaves stored folder unchanged", async () => {
		open.mockResolvedValueOnce(null);
		expect(await selectFolder()).toBe("");
		expect(updateConfig).not.toHaveBeenCalled();
	});
	test("dialog failure returns empty string and logs error", async () => {
		open.mockRejectedValueOnce(new Error("dialog unavailable"));
		expect(await selectFolder()).toBe("");
		expect(updateConfig).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
	test("config write failure returns empty string rather than reporting selection", async () => {
		updateConfig.mockRejectedValueOnce(new Error("disk full"));
		expect(await selectFolder()).toBe("");
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
});
