import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./version.mjs", import.meta.url));
const packageFixture = { name: "fixture", version: "1.2.3" };
const tauriFixture = '{"version": "1.2.3", "productName": "Wallpaper Picker UI"}\n';
const cargoFixture = '[package]\nname = "wallpaper-picker-ui"\nversion = "1.2.3"\n';

function withProject(run: (root: string) => void) {
	const root = mkdtempSync(join(tmpdir(), "wallpaper-version-"));
	try {
		mkdirSync(join(root, "src-tauri"));
		writeFileSync(join(root, "package.json"), JSON.stringify(packageFixture));
		writeFileSync(join(root, "src-tauri", "tauri.conf.json"), tauriFixture);
		writeFileSync(join(root, "src-tauri", "Cargo.toml"), cargoFixture);
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function runVersion(root: string, version: string) {
	return Bun.spawnSync({
		cmd: [process.execPath, script, version],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("version script", () => {
	test("updates package, Tauri, and Cargo versions but preserves other metadata", () => {
		withProject((root) => {
			const result = runVersion(root, "3.6.0");
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8"))).toEqual({
				name: "fixture",
				version: "3.6.0",
			});
			expect(
				JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")),
			).toEqual({
				version: "3.6.0",
				productName: "Wallpaper Picker UI",
			});
			expect(readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8")).toContain(
				'version = "3.6.0"',
			);
		});
	});

	test("rejects invalid versions without changing manifests", () => {
		for (const version of ["3.6", "v3.6.0", "3.6.0-beta.1"]) {
			withProject((root) => {
				const result = runVersion(root, version);
				expect(result.exitCode).toBe(1);
				expect(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).toBe(
					tauriFixture,
				);
				expect(readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8")).toBe(
					cargoFixture,
				);
				expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8"))).toEqual(
					packageFixture,
				);
			});
		}
	});
});
