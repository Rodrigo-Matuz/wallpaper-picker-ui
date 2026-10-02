import { describe, expect, test } from "bun:test";
import { sortJsonByKey } from "./sortJson";

describe("sortJsonByKey", () => {
	test("sorts keys alphabetically", () => {
		expect(sortJsonByKey({ zebra: 5, apple: 3, orange: 2 })).toEqual({
			apple: 3,
			orange: 2,
			zebra: 5,
		});
	});

	test("uses locale-aware comparison (case-insensitive base letters)", () => {
		const sorted = sortJsonByKey({ banana: 1, Apple: 2, cherry: 3 });
		expect(Object.keys(sorted)).toEqual(["Apple", "banana", "cherry"]);
	});

	test("returns an empty object for empty input", () => {
		expect(sortJsonByKey({})).toEqual({});
	});

	test("does not mutate the input object", () => {
		const input = { b: 1, a: 2 };
		sortJsonByKey(input);
		expect(Object.keys(input)).toEqual(["b", "a"]);
	});

	test("preserves values", () => {
		const map = { b: "/video/b.mp4", a: "/video/a.mp4" };
		expect(sortJsonByKey(map)).toEqual({
			a: "/video/a.mp4",
			b: "/video/b.mp4",
		});
	});
});
