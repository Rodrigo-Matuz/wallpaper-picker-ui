import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "../defaults";

const ensureConfig = mock(async () => {});
const readTextFile = mock(async () => JSON.stringify(defaultConfig));
const writeFile = mock(async (_path: string, _data: Uint8Array, _options: object) => {});
const log = mock(async () => {});
mock.module("$api/config/ensure/ensure", () => ({ ensureConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory, readTextFile, writeFile }));
const { clearConfigCache, fetchConfig, peekConfig, setConfigCache } = await import("./read");

beforeEach(() => {
	clearConfigCache();
	readTextFile.mockImplementation(async () => JSON.stringify(defaultConfig));
	writeFile.mockImplementation(async () => {});
});
afterEach(() => {
	clearConfigCache();
	ensureConfig.mockClear();
	readTextFile.mockClear();
	writeFile.mockClear();
	log.mockClear();
});

describe("fetchConfig", () => {
	test("ensures and reads the config file once, then serves the cache", async () => {
		const config = { ...defaultConfig, language: "eng" as const, command: "mpv $VP" };
		readTextFile.mockResolvedValueOnce(JSON.stringify(config));
		expect(await fetchConfig()).toEqual(config);
		expect(peekConfig()).toEqual(config);
		expect(ensureConfig).toHaveBeenCalledTimes(1);
		expect(readTextFile).toHaveBeenCalledWith("WallpaperPickerUI/config.json", {
			baseDir: BaseDirectory.Config,
		});
		expect(readTextFile).toHaveBeenCalledTimes(1);
	});

	test("set and clear cache control subsequent reads", async () => {
		const config = { ...defaultConfig, darkMode: false };
		setConfigCache(config);
		expect(await fetchConfig()).toBe(config);
		expect(readTextFile).not.toHaveBeenCalled();
		clearConfigCache();
		expect(peekConfig()).toBeNull();
		expect(await fetchConfig()).toEqual(defaultConfig);
		expect(readTextFile).toHaveBeenCalledTimes(1);
	});

	test("corrupt JSON is repaired with pretty-printed defaults and cached", async () => {
		readTextFile.mockResolvedValueOnce("{corrupt");
		expect(await fetchConfig()).toEqual(defaultConfig);
		expect(new TextDecoder().decode(writeFile.mock.calls[0][1])).toBe(
			JSON.stringify(defaultConfig, null, 4),
		);
		expect(writeFile.mock.calls[0][2]).toEqual({ baseDir: BaseDirectory.Config });
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				level: "error",
				message: expect.objectContaining({ context: expect.stringContaining("corrupted") }),
			}),
		);
		expect(await fetchConfig()).toEqual(defaultConfig);
		expect(readTextFile).toHaveBeenCalledTimes(1);
	});

	test("repair write failure still returns defaults", async () => {
		readTextFile.mockResolvedValueOnce("not JSON");
		writeFile.mockRejectedValueOnce(new Error("disk full"));
		expect(await fetchConfig()).toEqual(defaultConfig);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.objectContaining({
					context: "Failed to repair configuration file with defaults",
				}),
			}),
		);
	});

	test("read failure propagates without populating cache", async () => {
		const failure = new Error("permission denied");
		readTextFile.mockRejectedValueOnce(failure);
		await expect(fetchConfig()).rejects.toBe(failure);
		expect(peekConfig()).toBeNull();
		expect(writeFile).not.toHaveBeenCalled();
	});
});
