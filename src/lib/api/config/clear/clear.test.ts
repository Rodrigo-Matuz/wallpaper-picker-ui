import { afterEach, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "$api/config/defaults";
import { applicationWork } from "$utils/applicationWork/applicationWork";

const remove = mock(async (_path: string, _options: object) => {});
const clearConfigCache = mock(() => {});
const log = mock(async () => {});
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory, remove }));
mock.module("$api/config/read/read", () => ({
	clearConfigCache,
	fetchConfig: async () => defaultConfig,
}));
mock.module("$utils/logger/logger", () => ({ log }));
const { clearConfig } = await import("../clear");
afterEach(() => {
	for (const fn of [remove, clearConfigCache, log]) fn.mockClear();
});

test("reported delete failure returns false without clearing cache; confirmed deletion returns true", async () => {
	remove.mockRejectedValueOnce(new Error("delete denied"));
	expect(await clearConfig()).toBe(false);
	expect(clearConfigCache).not.toHaveBeenCalled();
	expect(await clearConfig()).toBe(true);
	expect(clearConfigCache).toHaveBeenCalledTimes(1);
	expect(applicationWork.hasPendingWork()).toBe(false);
});
