import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";

const ensureDir = mock(async () => {});
const exists = mock(async () => false);
const readTextFile = mock(async () => "{}");
const writeFile = mock(async (_path: string, _data: Uint8Array, _options: object) => {});
const rename = mock(async (_oldPath: string, _newPath: string, _options: object) => {});
const remove = mock(async (_path: string, _options: object) => {});
const fetchConfig = mock(async () => ({ thumbnailsHashMap: {} as Record<string, string> }));
const updateConfig = mock(async (_config: object) => true);
const log = mock(async () => {});
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$api/config/read/read", () => ({ fetchConfig }));
mock.module("$api/config/update/update", () => ({ updateConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("@tauri-apps/plugin-fs", () => ({
	BaseDirectory,
	exists,
	readTextFile,
	remove,
	rename,
	writeFile,
}));
const { readThumbnailMap, writeThumbnailMap, migrateThumbnailMapFromConfig } = await import(
	"./map"
);

beforeEach(() => {
	exists.mockResolvedValue(false);
	readTextFile.mockResolvedValue("{}");
	writeFile.mockImplementation(async () => {});
	fetchConfig.mockResolvedValue({ thumbnailsHashMap: {} });
	updateConfig.mockImplementation(async () => true);
});
afterEach(() => {
	for (const fn of [
		ensureDir,
		exists,
		readTextFile,
		writeFile,
		rename,
		remove,
		fetchConfig,
		updateConfig,
		log,
	]) {
		fn.mockClear();
	}
});

const { applicationWork } = await import("$utils/applicationWork/applicationWork");

describe("thumbnail map persistence", () => {
	test.each([
		false,
		true,
	])("tracks standalone read directory setup (setup rejection=%s)", async (setupFails) => {
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const setup = new Promise<void>((resolve) => {
			started = resolve;
		});
		const failure = new Error("directory denied");
		ensureDir.mockImplementationOnce(async () => {
			started();
			await gate;
			if (setupFails) throw failure;
		});
		const operation = readThumbnailMap();
		const settled = Promise.allSettled([operation]);
		try {
			await setup;
			expect(applicationWork.hasPendingWork()).toBe(true);
		} finally {
			release();
			await settled;
		}
		expect(applicationWork.hasPendingWork()).toBe(false);
		if (setupFails) await expect(operation).rejects.toBe(failure);
		else await expect(operation).resolves.toEqual({});
	});
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
	test("invalid map shapes return empty and log error", async () => {
		exists.mockResolvedValue(true);
		for (const invalid of ["[]", '{"../outside.png":"/videos/a.mp4"}', '{"a.png":42}']) {
			readTextFile.mockResolvedValueOnce(invalid);
			expect(await readThumbnailMap()).toEqual({});
		}
		expect(log).toHaveBeenCalledTimes(3);
	});
	test("writes pretty-printed UTF-8 map in app data", async () => {
		await writeThumbnailMap({ "é.png": "/café.mp4" });
		const [path, bytes, options] = writeFile.mock.calls[0];
		expect(path).toBe("thumbnails/map.json.tmp");
		expect(new TextDecoder().decode(bytes)).toBe(
			JSON.stringify({ "é.png": "/café.mp4" }, null, 4),
		);
		expect(options).toEqual({ baseDir: BaseDirectory.AppData });
		expect(rename).toHaveBeenCalledWith("thumbnails/map.json.tmp", "thumbnails/map.json", {
			oldPathBaseDir: BaseDirectory.AppData,
			newPathBaseDir: BaseDirectory.AppData,
		});
	});
	test("invalid maps are rejected before persistence", async () => {
		await expect(
			writeThumbnailMap({ "../outside.png": "/videos/a.mp4" } as Record<string, string>),
		).rejects.toThrow("invalid shape");
		expect(writeFile).not.toHaveBeenCalled();
		expect(rename).not.toHaveBeenCalled();
	});
	test("rename failure cleans the temporary map and is rethrown", async () => {
		const failure = new Error("rename denied");
		rename.mockRejectedValueOnce(failure);
		await expect(writeThumbnailMap({})).rejects.toBe(failure);
		expect(remove).toHaveBeenCalledWith("thumbnails/map.json.tmp", {
			baseDir: BaseDirectory.AppData,
		});
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
	test("failed config clear removes migrated map so migration can retry", async () => {
		const legacy = { "old.png": "/old.mp4" };
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: legacy });
		updateConfig.mockResolvedValueOnce(false);
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(remove).toHaveBeenCalledWith("thumbnails/map.json", {
			baseDir: BaseDirectory.AppData,
		});
	});
	test("rollback failure is logged when config clear fails", async () => {
		const legacy = { "old.png": "/old.mp4" };
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: legacy });
		updateConfig.mockResolvedValueOnce(false);
		remove.mockRejectedValueOnce(new Error("rollback denied"));
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.objectContaining({
					context: "Failed to roll back migrated thumbnail map",
				}),
			}),
		);
	});
	test("thrown config clear removes migrated map so migration can retry", async () => {
		const legacy = { "old.png": "/old.mp4" };
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: legacy });
		updateConfig.mockRejectedValueOnce(new Error("config unavailable"));
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(remove).toHaveBeenCalledWith("thumbnails/map.json", {
			baseDir: BaseDirectory.AppData,
		});
	});
	test("failed map write retains legacy config", async () => {
		fetchConfig.mockResolvedValue({ thumbnailsHashMap: { "old.png": "/old.mp4" } });
		writeFile.mockRejectedValueOnce(new Error("disk full"));
		expect(await migrateThumbnailMapFromConfig()).toEqual({});
		expect(updateConfig).not.toHaveBeenCalled();
	});
});
