import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-translations.mjs", import.meta.url));
const english = {
	code: "eng",
	translations: { "home.title": "Wallpaper", "home.subtitle": "Videos" },
};

function runChecker(files: Record<string, unknown>, reverseDirectoryOrder = false) {
	const root = mkdtempSync(join(tmpdir(), "wallpaper-translations-"));
	try {
		const directory = join(root, "src", "lib", "lang", "translations");
		mkdirSync(directory, { recursive: true });
		for (const [name, value] of Object.entries(files)) {
			writeFileSync(
				join(directory, name),
				typeof value === "string" ? value : JSON.stringify(value),
			);
		}
		const cmd = [process.execPath, script];
		if (reverseDirectoryOrder) {
			const preload = join(root, "reverse-directory-order.cjs");
			writeFileSync(
				preload,
				[
					'const fs = require("node:fs");',
					"const original = fs.readdirSync;",
					"fs.readdirSync = (...args) => original(...args).sort().reverse();",
					'require("node:module").syncBuiltinESMExports();',
				].join("\n"),
			);
			cmd.splice(1, 0, "--preload", preload);
		}
		const result = Bun.spawnSync({
			cmd,
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		return {
			exitCode: result.exitCode,
			stdout: new TextDecoder().decode(result.stdout),
			stderr: new TextDecoder().decode(result.stderr),
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("check-translations", () => {
	test("accepts matching valid translations", () => {
		const result = runChecker({
			"english.json": english,
			"portuguese.json": { ...english, code: "pt" },
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("2 translation files in sync (2 keys each)");
	});

	test("rejects an empty translation directory", () => {
		const result = runChecker({});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("No translation files found");
	});

	test("rejects malformed JSON", () => {
		const result = runChecker({ "english.json": "{" });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("invalid JSON");
	});

	test("rejects keys without dot notation", () => {
		const result = runChecker({
			"english.json": { code: "eng", translations: { invalid: "Text" } },
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('key "invalid" does not follow dot notation');
	});

	test("reports missing and extra keys across languages", () => {
		const result = runChecker({
			"english.json": english,
			"portuguese.json": {
				code: "pt",
				translations: { "home.title": "Papel", "home.extra": "Extra" },
			},
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('missing key "home.subtitle"');
		expect(result.stderr).toContain('extra key "home.extra"');
	});

	test("reports the same differences when directory enumeration is reversed", () => {
		const files = {
			"english.json": english,
			"portuguese.json": {
				code: "pt",
				translations: { "home.title": "Papel", "home.extra": "Extra" },
			},
		};
		const normal = runChecker(files);
		const reversed = runChecker(files, true);
		expect(normal.exitCode).toBe(1);
		expect(reversed.exitCode).toBe(1);
		expect(reversed.stderr).toBe(normal.stderr);
	});

	test("rejects blank and non-string translations", () => {
		const result = runChecker({
			"english.json": {
				code: "eng",
				translations: { "home.title": "  ", "home.subtitle": 42 },
			},
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('"home.title" has an empty or non-string value');
		expect(result.stderr).toContain('"home.subtitle" has an empty or non-string value');
	});
});
