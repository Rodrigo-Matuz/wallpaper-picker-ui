import { describe, expect, test } from "bun:test";
import { normalizeForSearch } from "./search";

describe("normalizeForSearch", () => {
	test("lowercases input", () => {
		expect(normalizeForSearch("Sunset Video")).toBe("sunsetvideo");
	});

	test("strips underscores and whitespace", () => {
		expect(normalizeForSearch("my_wallpaper clip.mp4")).toBe("mywallpaperclip.mp4");
	});

	test("strips runs of separators", () => {
		expect(normalizeForSearch("a   __  b")).toBe("ab");
	});

	test("keeps other punctuation (paths still searchable)", () => {
		expect(normalizeForSearch("/videos/nature/river.mp4")).toBe("/videos/nature/river.mp4");
	});

	test("empty string stays empty", () => {
		expect(normalizeForSearch("")).toBe("");
	});
});
