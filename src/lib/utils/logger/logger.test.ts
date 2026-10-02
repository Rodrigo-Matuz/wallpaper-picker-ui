import { describe, expect, test } from "bun:test";
import { normalizeLogMessage } from "./logger";

describe("normalizeLogMessage", () => {
	test("structured message with an Error appends error.message to context", () => {
		expect(
			normalizeLogMessage({
				context: "Failed to save thumbnails",
				error: new Error("Disk is full"),
			}),
		).toBe("Failed to save thumbnails: Disk is full");
	});

	test("structured message with a non-Error error stringifies it", () => {
		expect(normalizeLogMessage({ context: "Failed to load", error: "timeout" })).toBe(
			"Failed to load: timeout",
		);
	});

	test("structured message without error logs only the context", () => {
		expect(normalizeLogMessage({ context: "Application started" })).toBe("Application started");
	});

	test("bare Error instances log their message", () => {
		expect(normalizeLogMessage(new Error("boom"))).toBe("boom");
	});

	test("plain objects are serialized as JSON", () => {
		expect(normalizeLogMessage({ count: 3, dir: "/videos" })).toBe(
			'{"count":3,"dir":"/videos"}',
		);
	});

	test("null is coerced", () => {
		expect(normalizeLogMessage(null)).toBe("null");
	});

	test("numbers and strings are coerced", () => {
		expect(normalizeLogMessage(42)).toBe("42");
		expect(normalizeLogMessage("hello")).toBe("hello");
	});
});
