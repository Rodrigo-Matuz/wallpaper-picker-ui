import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ScopedPermission {
	identifier: string;
	allow?: { path: string }[];
}

const capabilityPath = fileURLToPath(
	new URL("../../src-tauri/capabilities/permissions.json", import.meta.url),
);
const capability: { permissions: (string | ScopedPermission)[] } = JSON.parse(
	readFileSync(capabilityPath, "utf8"),
);

function pathsFor(identifier: string): string[] {
	return capability.permissions.flatMap((permission) =>
		typeof permission === "string" || permission.identifier !== identifier
			? []
			: (permission.allow ?? []).map(({ path }) => path),
	);
}

describe("Tauri file permissions for the thumbnail map", () => {
	test("directory creation and existence checks are scoped", () => {
		expect(capability.permissions).not.toContain("fs:allow-mkdir");
		expect(capability.permissions).not.toContain("fs:allow-exists");
		expect(pathsFor("fs:allow-mkdir")).toEqual([
			"$CONFIG/WallpaperPickerUI",
			"$APPDATA/thumbnails",
		]);
		expect(pathsFor("fs:allow-exists")).toEqual([
			"$CONFIG/WallpaperPickerUI",
			"$CONFIG/WallpaperPickerUI/config.json",
			"$APPDATA/thumbnails",
			"$APPDATA/thumbnails/map.json",
		]);
	});

	test("exists can check the map and its parent directory", () => {
		expect(pathsFor("fs:allow-exists")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-exists")).toContain("$APPDATA/thumbnails");
	});

	test("read and write cover the map but not arbitrary app data", () => {
		expect(pathsFor("fs:allow-read-text-file")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-read-text-file")).not.toContain("$APPDATA/**");
		expect(pathsFor("fs:allow-write-file")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-write-file")).toContain("$APPDATA/thumbnails/map.json.tmp");
		expect(pathsFor("fs:allow-write-file")).not.toContain("$APPDATA/**");
	});

	test("thumbnail images can still be read", () => {
		expect(pathsFor("fs:allow-read-file")).toContain("$APPDATA/thumbnails/*");
	});

	test("thumbnail map replacement is scoped to the map and its temporary file", () => {
		expect(pathsFor("fs:allow-rename")).toEqual([
			"$APPDATA/thumbnails/map.json",
			"$APPDATA/thumbnails/map.json.tmp",
		]);
	});

	test("thumbnail clearing can remove only the app-owned thumbnail directory", () => {
		expect(pathsFor("fs:allow-remove")).toEqual(["$APPDATA/thumbnails"]);
	});

	test("restart uses the narrow process permission", () => {
		expect(capability.permissions).toContain("process:allow-restart");
		expect(capability.permissions).not.toContain("process:default");
	});

	test("updater and dialog capabilities expose only the operations used by the frontend", () => {
		expect(capability.permissions).not.toContain("updater:default");
		expect(capability.permissions).toEqual(
			expect.arrayContaining([
				"updater:allow-check",
				"updater:allow-download",
				"updater:allow-install",
				"dialog:allow-open",
			]),
		);
		expect(capability.permissions).not.toContain("opener:default");
	});
});
