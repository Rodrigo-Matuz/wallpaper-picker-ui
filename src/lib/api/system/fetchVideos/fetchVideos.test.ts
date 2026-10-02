import { afterEach, describe, expect, mock, test } from "bun:test";

const invoke = mock(
	async (_command: string, _args: object): Promise<string[]> => ["/videos/a.mp4"],
);
const fetchConfig = mock(async () => ({ wallpapersPath: "/videos" }));
const log = mock(async () => {});
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("$api/config/read/read", () => ({ fetchConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
const { fetchVideos } = await import("./fetchVideos");

afterEach(() => {
	invoke.mockReset();
	invoke.mockImplementation(async () => ["/videos/a.mp4"]);
	fetchConfig.mockReset();
	fetchConfig.mockImplementation(async () => ({ wallpapersPath: "/videos" }));
	log.mockClear();
});

describe("fetchVideos", () => {
	test("scans configured directory and returns backend results unchanged", async () => {
		invoke.mockResolvedValueOnce(["/videos/a.mp4", "/videos/sub/b.mkv"]);
		expect(await fetchVideos()).toEqual(["/videos/a.mp4", "/videos/sub/b.mkv"]);
		expect(invoke).toHaveBeenCalledWith("get_videos_list", { directory: "/videos" });
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.objectContaining({ count: 2, directory: "/videos" }),
			}),
		);
	});
	test("unset path skips scanning and logs warning", async () => {
		fetchConfig.mockResolvedValueOnce({ wallpapersPath: "" });
		expect(await fetchVideos()).toEqual([]);
		expect(invoke).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
	});
	test("backend failures propagate to caller", async () => {
		const failure = new Error("scan failed");
		invoke.mockRejectedValueOnce(failure);
		await expect(fetchVideos()).rejects.toBe(failure);
	});
});
