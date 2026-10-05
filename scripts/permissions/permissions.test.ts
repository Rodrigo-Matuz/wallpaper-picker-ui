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
	test("exists can check the map and its parent directory", () => {
		expect(pathsFor("fs:allow-exists")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-exists")).toContain("$APPDATA/thumbnails");
	});

	test("read and write cover the map but not arbitrary app data", () => {
		expect(pathsFor("fs:allow-read-file")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-write-file")).toContain("$APPDATA/thumbnails/map.json");
		expect(pathsFor("fs:allow-write-file")).not.toContain("$APPDATA/**");
	});

	test("thumbnail images can still be read", () => {
		expect(pathsFor("fs:allow-read-file")).toContain("$APPDATA/thumbnails/*");
	});
});
