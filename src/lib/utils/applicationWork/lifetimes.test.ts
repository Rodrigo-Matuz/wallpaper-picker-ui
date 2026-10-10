import { beforeEach, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { writable } from "svelte/store";
import { defaultConfig } from "$api/config/defaults";
import { applicationWork } from "./applicationWork";

const ensureDir = mock(async () => {});
const exists = mock(async () => true);
const writeFile = mock(async () => {});
const remove = mock(async () => {});
const readFile = mock(async () => new Uint8Array([1]));
const readTextFile = mock(async () => "{}");
const log = mock(async () => {});
const fetchConfig = mock(async () => ({ ...defaultConfig }));
const setConfigCache = mock(() => {});
const clearConfigCache = mock(() => {});
const invoke = mock(async (_command: string, _args: object): Promise<unknown> => "a.png");
const appDataDir = mock(async () => "/mock/data");
const basename = mock(async (path: string) => path);
const fetchVideos = mock(async () => ["/mock/a.mp4", "/mock/b.mp4"]);
mock.module("@tauri-apps/plugin-fs", () => ({
	BaseDirectory,
	exists,
	writeFile,
	remove,
	readFile,
	readTextFile,
}));
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@tauri-apps/api/path", () => ({ appDataDir, basename }));
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("$api/config/read/read", () => ({
	fetchConfig,
	setConfigCache,
	clearConfigCache,
	readConfigForDiagnostics: async () => defaultConfig,
}));
mock.module("$api/system/fetchVideos/fetchVideos", () => ({ fetchVideos }));
mock.module("$lang/index", () => ({ t: writable((key: string) => key) }));
mock.module("svelte-sonner", () => ({ toast: { warning: mock(() => {}) } }));
const { ensureConfig } = await import("$api/config/ensure/ensure");
const { clearConfig } = await import("$api/config/clear");
const { clearThumbnails } = await import("$api/thumbnails/clear");
const { generateThumb } = await import("$api/thumbnails/generate/generate");
const { handleThumbnails, thumbnails } = await import("$api/thumbnails/handle");
const { writeThumbnailMap, migrateThumbnailMapFromConfig } = await import(
	"$api/thumbnails/map/map"
);

beforeEach(() => {
	for (const fn of [
		ensureDir,
		exists,
		writeFile,
		remove,
		readFile,
		readTextFile,
		log,
		fetchConfig,
		setConfigCache,
		clearConfigCache,
		invoke,
		appDataDir,
		basename,
		fetchVideos,
	]) {
		fn.mockReset();
	}
	ensureDir.mockImplementation(async () => {});
	exists.mockImplementation(async () => true);
	writeFile.mockImplementation(async () => {});
	remove.mockImplementation(async () => {});
	log.mockImplementation(async () => {});
	fetchConfig.mockImplementation(async () => ({ ...defaultConfig }));
	invoke.mockImplementation(async () => "a.png");
	readFile.mockImplementation(async () => new Uint8Array([1]));
	readTextFile.mockImplementation(async () => "{}");
	appDataDir.mockImplementation(async () => "/mock/data");
	basename.mockImplementation(async (path) => path);
	fetchVideos.mockImplementation(async () => ["/mock/a.mp4", "/mock/b.mp4"]);
	expect(applicationWork.getSnapshot().pendingWork).toBe(0);
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function expectTracked(run: () => Promise<unknown>, block: (promise: Promise<void>) => void) {
	const gate = deferred();
	block(gate.promise);
	const operation = run();
	try {
		expect(applicationWork.hasPendingWork()).toBe(true);
	} finally {
		gate.resolve();
		await operation;
	}
	expect(applicationWork.hasPendingWork()).toBe(false);
}

test("clearThumbnails owns removal, nested map reset, logging, and caught failures", async () => {
	await expectTracked(clearThumbnails, (gate) => remove.mockImplementationOnce(() => gate));
	expect(writeFile).toHaveBeenCalledTimes(1);
	writeFile.mockImplementationOnce(async () => {
		expect(applicationWork.getSnapshot().pendingWork).toBe(2);
	});
	log.mockImplementationOnce(async () => {
		expect(applicationWork.getSnapshot().pendingWork).toBe(1);
	});
	await clearThumbnails();
	expect(applicationWork.hasPendingWork()).toBe(false);
	remove.mockRejectedValueOnce(new Error("remove denied"));
	await clearThumbnails();
	expect(applicationWork.hasPendingWork()).toBe(false);
	writeFile.mockRejectedValueOnce(new Error("map denied"));
	await clearThumbnails();
	expect(applicationWork.hasPendingWork()).toBe(false);
	log.mockRejectedValue(new Error("logger failed"));
	await expect(clearThumbnails()).rejects.toThrow("logger failed");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("joined thumbnail pipeline remains tracked through concurrent generation, map, cleanup, blobs, publication", async () => {
	const directory = deferred();
	const generated = deferred();
	const generation = deferred();
	const mapStarted = deferred();
	const mapWrite = deferred();
	const cleanupStarted = deferred();
	const cleanup = deferred();
	const blobStarted = deferred();
	const blob = deferred();
	let generationCalls = 0;
	ensureDir.mockImplementationOnce(() => directory.promise);
	invoke.mockImplementation(async (command) => {
		if (command === "generate_thumb") {
			if (++generationCalls === 2) generated.resolve();
			await generation.promise;
			return "a.png";
		}
		cleanupStarted.resolve();
		await cleanup.promise;
	});
	writeFile.mockImplementationOnce(async () => {
		mapStarted.resolve();
		await mapWrite.promise;
	});
	readFile.mockImplementationOnce(async () => {
		blobStarted.resolve();
		await blob.promise;
		return new Uint8Array([1]);
	});
	let published = false;
	let observing = false;
	const unsubscribe = thumbnails.subscribe((map) => {
		if (observing && Object.keys(map).length) {
			published = true;
			expect(applicationWork.hasPendingWork()).toBe(true);
		}
	});
	observing = true;
	const first = handleThumbnails();
	const joined = handleThumbnails(true);
	try {
		// Two pipeline callers plus the directory-creating map read.
		expect(applicationWork.getSnapshot().pendingWork).toBe(3);
		directory.resolve();
		await generated.promise;
		expect(applicationWork.getSnapshot().pendingWork).toBe(4);
		generation.resolve();
		await mapStarted.promise;
		expect(applicationWork.getSnapshot().pendingWork).toBe(3);
		mapWrite.resolve();
		await cleanupStarted.promise;
		expect(applicationWork.getSnapshot().pendingWork).toBe(2);
		cleanup.resolve();
		await blobStarted.promise;
		expect(applicationWork.getSnapshot().pendingWork).toBe(2);
		blob.resolve();
		await Promise.all([first, joined]);
		expect(generationCalls).toBe(2);
		expect(published).toBe(true);
		expect(applicationWork.hasPendingWork()).toBe(false);
	} finally {
		unsubscribe();
		for (const gate of [directory, generation, mapWrite, cleanup, blob]) gate.resolve();
		await Promise.all([first, joined]);
	}
});

test("joined pipeline rejection settles both callers and allows a subsequent pipeline", async () => {
	const gate = deferred();
	ensureDir.mockImplementationOnce(async () => {
		await gate.promise;
		throw new Error("setup denied");
	});
	const first = handleThumbnails();
	const joined = handleThumbnails();
	const settled = Promise.allSettled([first, joined]);
	try {
		expect(applicationWork.getSnapshot().pendingWork).toBe(3);
	} finally {
		gate.resolve();
		await settled;
	}
	expect((await settled).map((result) => result.status)).toEqual(["rejected", "rejected"]);
	expect(applicationWork.hasPendingWork()).toBe(false);
	await expectTracked(handleThumbnails, (wait) => ensureDir.mockImplementationOnce(() => wait));
});

test("direct thumbnail generation counts concurrent calls before setup until invoke/log settlement", async () => {
	const gate = deferred();
	ensureDir.mockImplementation(() => gate.promise);
	const first = generateThumb("/mock/a.mp4");
	const second = generateThumb("/mock/b.mp4");
	try {
		expect(applicationWork.getSnapshot().pendingWork).toBe(2);
	} finally {
		gate.resolve();
		await Promise.all([first, second]);
	}
	expect(applicationWork.hasPendingWork()).toBe(false);
	invoke.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("generation failed");
	});
	await expect(generateThumb("/mock/a.mp4")).resolves.toEqual({
		ok: false,
		error: "generation failed",
	});
	expect(applicationWork.hasPendingWork()).toBe(false);
	ensureDir.mockRejectedValueOnce(new Error("directory denied"));
	await expect(generateThumb("/mock/a.mp4")).rejects.toThrow("directory denied");
	expect(applicationWork.hasPendingWork()).toBe(false);
	invoke.mockRejectedValueOnce(new Error("generation failed"));
	log.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("logger failed");
	});
	await expect(generateThumb("/mock/a.mp4")).rejects.toThrow("logger failed");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("migration owns its full lookup, nested map/config writes, and early returns", async () => {
	await expectTracked(migrateThumbnailMapFromConfig, (gate) =>
		exists.mockImplementationOnce(async () => {
			await gate;
			return true;
		}),
	);
	exists.mockResolvedValue(false);
	await expect(migrateThumbnailMapFromConfig()).resolves.toEqual({});
	expect(applicationWork.hasPendingWork()).toBe(false);
	const legacy = { "old.png": "/mock/old.mp4" };
	fetchConfig.mockResolvedValue({ ...defaultConfig, thumbnailsHashMap: legacy });
	writeFile.mockImplementation(async () => {
		expect(applicationWork.getSnapshot().pendingWork).toBeGreaterThanOrEqual(2);
	});
	log.mockImplementation(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
	});
	await expect(migrateThumbnailMapFromConfig()).resolves.toEqual(legacy);
	expect(writeFile).toHaveBeenCalledTimes(3);
	expect(applicationWork.hasPendingWork()).toBe(false);
	writeFile.mockRejectedValueOnce(new Error("map denied"));
	await expect(migrateThumbnailMapFromConfig()).resolves.toEqual({});
	expect(applicationWork.hasPendingWork()).toBe(false);
	exists.mockRejectedValueOnce(new Error("lookup denied"));
	await expect(migrateThumbnailMapFromConfig()).rejects.toThrow("lookup denied");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("writeThumbnailMap tracks setup, write, and rejected logging", async () => {
	await expectTracked(
		() => writeThumbnailMap({}),
		(gate) => ensureDir.mockImplementationOnce(() => gate),
	);
	writeFile.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("map denied");
	});
	await expect(writeThumbnailMap({})).rejects.toThrow("map denied");
	expect(applicationWork.hasPendingWork()).toBe(false);
	ensureDir.mockRejectedValueOnce(new Error("directory denied"));
	await expect(writeThumbnailMap({})).rejects.toThrow("directory denied");
	expect(applicationWork.hasPendingWork()).toBe(false);
	writeFile.mockRejectedValueOnce(new Error("map denied"));
	log.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("logger failed");
	});
	await expect(writeThumbnailMap({})).rejects.toThrow("logger failed");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("clearConfig tracks removal through logging and settles caught failures", async () => {
	await expectTracked(clearConfig, (gate) => remove.mockImplementationOnce(() => gate));
	expect(clearConfigCache).toHaveBeenCalledTimes(1);
	const started = deferred();
	const gate = deferred();
	log.mockImplementationOnce(async () => {
		started.resolve();
		await gate.promise;
	});
	const operation = clearConfig();
	await started.promise;
	try {
		expect(applicationWork.hasPendingWork()).toBe(true);
	} finally {
		gate.resolve();
		await operation;
	}
	remove.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("remove denied");
	});
	await clearConfig();
	expect(applicationWork.hasPendingWork()).toBe(false);
	log.mockRejectedValue(new Error("logger failed"));
	await expect(clearConfig()).rejects.toThrow("logger failed");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("ensureConfig accounts before directory setup and settles its existing-file early return", async () => {
	await expectTracked(ensureConfig, (gate) => ensureDir.mockImplementationOnce(() => gate));
	expect(writeFile).not.toHaveBeenCalled();
	exists.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("exists denied");
	});
	await expect(ensureConfig()).rejects.toThrow("exists denied");
	expect(applicationWork.hasPendingWork()).toBe(false);
	exists.mockResolvedValueOnce(false);
	writeFile.mockImplementationOnce(async () => {
		expect(applicationWork.hasPendingWork()).toBe(true);
		throw new Error("write denied");
	});
	await ensureConfig();
	expect(applicationWork.hasPendingWork()).toBe(false);
});
