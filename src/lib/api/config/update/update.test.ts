import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "../defaults";

const ensureConfig = mock(async () => {});
const ensureDir = mock(async () => {});
const log = mock(async () => {});
const writeFile = mock(async (_path: string, _data: Uint8Array, _options: object) => {});
const fetchConfig = mock(async () => ({ ...defaultConfig }));
const setConfigCache = mock((_config: typeof defaultConfig) => {});
mock.module("$api/config/ensure/ensure", () => ({ ensureConfig }));
mock.module("$api/config/read/read", () => ({ fetchConfig, setConfigCache }));
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory, writeFile }));
const { updateConfig } = await import("./update");

beforeEach(() => {
	fetchConfig.mockImplementation(async () => ({ ...defaultConfig }));
	writeFile.mockImplementation(async () => {});
});
afterEach(() => {
	for (const fn of [ensureConfig, ensureDir, log, writeFile, fetchConfig, setConfigCache]) {
		fn.mockClear();
	}
});

describe("updateConfig", () => {
	test("merges partial settings, writes formatted JSON and updates cache only after write", async () => {
		fetchConfig.mockResolvedValueOnce({
			...defaultConfig,
			command: "mpv $VP",
			newWallpapers: false,
		});
		await updateConfig({ darkMode: false });
		expect(ensureDir).toHaveBeenCalledWith("WallpaperPickerUI", BaseDirectory.Config);
		expect(ensureConfig).toHaveBeenCalledTimes(1);
		const [path, bytes, options] = writeFile.mock.calls[0];
		expect(path).toBe("WallpaperPickerUI/config.json");
		expect(options).toEqual({ baseDir: BaseDirectory.Config });
		const merged = {
			...defaultConfig,
			command: "mpv $VP",
			newWallpapers: false,
			darkMode: false,
		};
		expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(merged, null, 4));
		expect(setConfigCache).toHaveBeenCalledWith(merged);
	});

	test("serializes simultaneous writes so the second observes the first update", async () => {
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		let current = { ...defaultConfig };
		fetchConfig.mockImplementation(async () => ({ ...current }));
		writeFile.mockImplementationOnce(async () => {
			await blocked;
		});
		setConfigCache.mockImplementation((config) => {
			current = { ...config };
		});
		const first = updateConfig({ command: "mpv $VP" });
		const second = updateConfig({ darkMode: false });
		// Let both calls reach the queue; the second must not read stale config.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fetchConfig).toHaveBeenCalledTimes(1);
		release();
		await Promise.all([first, second]);
		expect(fetchConfig).toHaveBeenCalledTimes(2);
		expect(JSON.parse(new TextDecoder().decode(writeFile.mock.calls[1][1]))).toMatchObject({
			command: "mpv $VP",
			darkMode: false,
		});
	});

	test("failed writes do not update cache; later queued writes still run", async () => {
		writeFile.mockRejectedValueOnce(new Error("disk full"));
		await updateConfig({ darkMode: false });
		expect(setConfigCache).not.toHaveBeenCalled();
		await updateConfig({ command: "mpv $VP" });
		expect(writeFile).toHaveBeenCalledTimes(2);
		expect(setConfigCache).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				level: "error",
				message: expect.objectContaining({ context: "Failed to write configuration file" }),
			}),
		);
	});

	test("read failures do not write or cache settings", async () => {
		fetchConfig.mockRejectedValueOnce(new Error("read denied"));
		await updateConfig({ darkMode: false });
		expect(writeFile).not.toHaveBeenCalled();
		expect(setConfigCache).not.toHaveBeenCalled();
	});
});
