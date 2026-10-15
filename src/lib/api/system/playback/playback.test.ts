import { describe, expect, test } from "bun:test";
import { playbackBackendForPlatform } from "./backend";

describe("wallpaper playback routing", () => {
	test("uses native playback on Windows", () => {
		expect(playbackBackendForPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
			"windows-native",
		);
	});

	test("keeps the configured command on Linux and macOS", () => {
		expect(playbackBackendForPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe(
			"configured-command",
		);
		expect(playbackBackendForPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
			"configured-command",
		);
	});
});
