import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";

const ensureDir = mock(async () => {});
const exists = mock(async () => false);
const readTextFile = mock(async () => "{}");
const writeFile = mock(async (_path: string, _data: Uint8Array, _options: object) => {});
const fetchConfig = mock(async () => ({ thumbnailsHashMap: {} as Record<string, string> }));
const updateConfig = mock(async (_config: object) => {});
const log = mock(async () => {});
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$api/config/read/read", () => ({ fetchConfig }));
mock.module("$api/config/update/update", () => ({ updateConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory, exists, readTextFile, writeFile }));
const { readThumbnailMap, writeThumbnailMap, migrateThumbnailMapFromConfig } = await import(
	"./map"
);

beforeEach(() => {
	exists.mockResolvedValue(false);
	readTextFile.mockResolvedValue("{}");
	writeFile.mockImplementation(async () => {});
	fetchConfig.mockResolvedValue({ thumbnailsHashMap: {} });
	updateConfig.mockImplementation(async () => {});
});
afterEach(() => {
	for (const fn of [ensureDir, exists, readTextFile, writeFile, fetchConfig, updateConfig, log]) {
		fn.mockClear();
	}
});

describe("thumbnail map persistence", () => {
	test("missing map yields empty record without a read", async () => {
		expect(await readThumbnailMap()).toEqual({});
		expect(ensureDir).toHaveBeenCalledWith("thumbnails", BaseDirectory.AppData);
		expect(exists).toHaveBeenCalledWith("thumbnails/map.json", {
			baseDir: BaseDirectory.AppData,
		});
		expect(readTextFile).not.toHaveBeenCalled();
	});
	test("reads valid map JSON", async () => {
		exists.mockResolvedValue(true);
		readTextFile.mockResolvedValue('{"a.png":"/videos/a.mp4"}');
		expect(await readThumbnailMap()).toEqual({ "a.png": "/videos/a.mp4" });
	});
	test("corrupt map returns empty and logs error", async () => {
		exists.mockResolvedValue(true);
		readTextFile.mockResolvedValue("bad JSON");
		expect(await readThumbnailMap()).toEqual({});
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.objectContaining({ context: "Failed to read thumbnail map file" }),
			}),
		);
	});
	test("writes pretty-printed UTF-8 map in app data", async () => {
		await writeThumbnailMap({ "é.png": "/café.mp4" });
		const [path, bytes, options] = writeFile.mock.calls[0];
		expect(path).toBe("thumbnails/map.json");
		expect(new TextDecoder().decode(bytes)).toBe(
			JSON.stringify({ "é.png": "/café.mp4" }, null, 4),
		);
		expect(options).toEqual({ baseDir: BaseDirectory.AppData });
	});
	test("write failure is logged and rethrown", async () => {
		const failure = new Error("disk full");
		writeFile.mockRejectedValueOnce(failure);
		await expect(writeThumbnailMap({})).rejects.toBe(failure);
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
});

describe("legacy thumbnail migration", () => {
	test("existing map is never overwritten or config read", async () => {
		exists.mockResolvedValue(true);
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(fetchConfig).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});
	test("empty legacy map does not create map file", async () => {
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(writeFile).not.toHaveBeenCalled();
	});
	test("moves legacy entries to map before clearing config", async () => {
		const legacy = { "old.png": "/videos/old.mp4" };
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: legacy });
		await expect(migrateThumbnailMapFromConfig()).resolves.toEqual(legacy);
		expect(JSON.parse(new TextDecoder().decode(writeFile.mock.calls[0][1]))).toEqual(legacy);
		expect(updateConfig).toHaveBeenCalledWith({ thumbnailsHashMap: {} });
	});
	test("failed map write retains legacy config", async () => {
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: { "old.png": "/old.mp4" } });
		writeFile.mockRejectedValueOnce(new Error("disk full"));
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(updateConfig).not.toHaveBeenCalled();
	});
});
