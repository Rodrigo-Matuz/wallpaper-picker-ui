import { afterEach, describe, expect, mock, test } from "bun:test";
import { BaseDirectory } from "@tauri-apps/plugin-fs";

const invoke = mock(async (_command: string, _args: object) => "/data/thumbnails/a.png");
const ensureDir = mock(async () => {});
const log = mock(async () => {});
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@tauri-apps/plugin-fs", () => ({ BaseDirectory }));
mock.module("$utils/ensureDirs", () => ({ ensureDir }));
mock.module("$utils/logger/logger", () => ({ log }));
const { generateThumb } = await import("./generate");

afterEach(() => {
	invoke.mockReset();
	invoke.mockImplementation(async () => "/data/thumbnails/a.png");
	ensureDir.mockClear();
	log.mockClear();
});

describe("generateThumb", () => {
	test("ensures app-data directory and invokes backend with only the video path", async () => {
		expect(await generateThumb("/videos/a.mp4")).toEqual({
			ok: true,
			value: "/data/thumbnails/a.png",
		});
		expect(ensureDir).toHaveBeenCalledWith("thumbnails", BaseDirectory.AppData);
		expect(invoke).toHaveBeenCalledWith("generate_thumb", {
			forceRegenerate: false,
			videoPath: "/videos/a.mp4",
		});
	});
	test("passes through an explicit regeneration request", async () => {
		await generateThumb("/videos/a.mp4", true);
		expect(invoke).toHaveBeenCalledWith("generate_thumb", {
			forceRegenerate: true,
			videoPath: "/videos/a.mp4",
		});
	});
	test("backend Error returns a failure result and logs it", async () => {
		invoke.mockRejectedValueOnce(new Error("ffmpeg missing"));
		expect(await generateThumb("/a.mp4")).toEqual({ ok: false, error: "ffmpeg missing" });
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
	test("non-Error backend rejection is converted to a descriptive failure", async () => {
		invoke.mockRejectedValueOnce("backend unavailable");
		expect(await generateThumb("/a.mp4")).toEqual({
			ok: false,
			error: "backend unavailable",
		});
	});
});
