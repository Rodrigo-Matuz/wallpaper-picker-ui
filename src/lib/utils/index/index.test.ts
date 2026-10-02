import { describe, expect, test } from "bun:test";
import { cn } from "./index";

describe("cn", () => {
	test("joins conditional class tokens", () => {
		expect(cn("base", false && "hidden", { active: true, disabled: false })).toBe(
			"base active",
		);
	});
	test("resolves conflicting Tailwind utility classes", () => {
		expect(cn("p-2 text-sm", "p-4 text-lg")).toBe("p-4 text-lg");
	});
	test("preserves nonconflicting responsive utilities", () => {
		expect(cn("p-2", "md:p-4", "hover:bg-red-500")).toBe("p-2 md:p-4 hover:bg-red-500");
	});
	test("empty input yields an empty class string", () => {
		expect(cn(null, undefined, false)).toBe("");
	});
});
