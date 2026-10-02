import { afterEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { defaultConfig } from "../defaults";

const exists = mock(async () => false);
const writeFile = mock(async (_path: string, _bytes: Uint8Array, _options: object) => {});
const ensureDir = mock(async () => {});
const log = mock(async () => {});
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory, exists, writeFile }));
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$utils/logger/logger", () => ({ log }));
const { ensureConfig } = await import("./ensure");

afterEach(() => {
	exists.mockReset();
	exists.mockResolvedValue(false);
	writeFile.mockReset();
	writeFile.mockImplementation(async () => {});
	ensureDir.mockClear();
	log.mockClear();
});

describe("ensureConfig", () => {
	test("creates missing config with defaults in config base directory", async () => {
		await ensureConfig();
		expect(ensureDir).toHaveBeenCalledWith("WallpaperPickerUI", BaseDirectory.Config);
		expect(exists).toHaveBeenCalledWith("WallpaperPickerUI/config.json", {
			baseDir: BaseDirectory.Config,
		});
		const [path, bytes, options] = writeFile.mock.calls[0];
		expect(path).toBe("WallpaperPickerUI/config.json");
		expect(options).toEqual({ baseDir: BaseDirectory.Config });
		expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(defaultConfig, null, 4));
	});
	test("does not overwrite existing settings", async () => {
		exists.mockResolvedValueOnce(true);
		await ensureConfig();
		expect(writeFile).not.toHaveBeenCalled();
	});
	test("logs write failure without throwing", async () => {
		writeFile.mockRejectedValueOnce(new Error("permission denied"));
		await ensureConfig();
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
});
