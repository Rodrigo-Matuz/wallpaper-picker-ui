import { describe, expect, test } from "bun:test";
import { isWindowsPlatform } from "./platform";

describe("Windows platform detection", () => {
	test("recognizes Windows desktop user agents", () => {
		expect(
			isWindowsPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
		).toBe(true);
	});

	test("recognizes Windows Phone user agents", () => {
		expect(isWindowsPlatform("Mozilla/5.0 (Windows Phone 10.0; Android 4.2.1)")).toBe(true);
	});

	test("does not classify Linux or macOS as Windows", () => {
		expect(isWindowsPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")).toBe(false);
		expect(isWindowsPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
	});
});
