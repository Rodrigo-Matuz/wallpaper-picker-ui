import { expect, test } from "bun:test";
import { assertMetadata, assertSupport, assertUpgrade } from "./assertions";

test("upgrade needs new native identity, PE version, no cross-install and byte-exact fixtures", () => {
	const pre = {
		pid: 10,
		path: "C:/App/main.exe",
		startedUtc: "2026-01-01T00:00:00Z",
		peVersion: "3.6.0.0",
		sha256: "a",
	};
	const post = {
		...pre,
		pid: 11,
		startedUtc: "2026-01-01T00:00:02Z",
		peVersion: "3.6.1.0",
		sha256: "b",
	};
	const before = [{ key: "HKCU/app", kind: "nsis", version: "3.6.0" }];
	const after = [{ ...before[0], version: "3.6.1" }];
	const hashes = { config: "1", map: "2", cache: "3", video: "4" };
	const check = (p = post, r = after, h = hashes) =>
		assertUpgrade(pre, p, before, r, hashes, h, "nsis", "2026-01-01T00:00:01Z");
	expect(() => check()).not.toThrow();
	for (const change of [
		{ pid: 10, startedUtc: pre.startedUtc },
		{ peVersion: "3.6.0.0" },
		{ path: "C:/Other/main.exe" },
		{ sha256: "a" },
	])
		expect(() => check({ ...post, ...change })).toThrow();
	expect(() =>
		check(post, [...after, { key: "HKLM/other", kind: "msi", version: "3.6.1" }]),
	).toThrow();
	expect(() => check(post, after, { ...hashes, cache: "changed" })).toThrow();
});

test("native check metadata pins versions and exact target signed published URL", () => {
	const candidate = {
		version: "3.6.1",
		assetName: "Wallpaper.Picker.UI_3.6.1_x64_en-US.msi",
		url: "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.1/Wallpaper.Picker.UI_3.6.1_x64_en-US.msi",
		signature: "public-signature",
	};
	const m = {
		rid: 1,
		currentVersion: "3.6.0",
		version: "3.6.1",
		rawJson: {
			version: "3.6.1",
			platforms: {
				"windows-x86_64-msi": { url: candidate.url, signature: candidate.signature },
			},
		},
	};
	expect(() => assertMetadata(m, "windows-x86_64-msi", candidate)).not.toThrow();
	for (const change of [
		{ currentVersion: "3.5.0" },
		{ version: "3.6.2" },
		{ rid: -1 },
		{
			rawJson: {
				platforms: {
					"windows-x86_64": { url: candidate.url, signature: candidate.signature },
				},
			},
		},
	]) {
		expect(() =>
			assertMetadata({ ...m, ...change }, "windows-x86_64-msi", candidate),
		).toThrow();
	}
	expect(() => assertMetadata(m, "windows-x86_64-nsis", candidate)).toThrow();
	expect(() =>
		assertMetadata(m, "windows-x86_64-msi", { ...candidate, signature: "different" }),
	).toThrow();
});

test("packaged support must identify native installer but never authorize production target", () => {
	const support = {
		mode: "manual-only",
		platform: "windows",
		architecture: "x86_64",
		installer: "msi",
		target: null,
		reason: "native-validation-pending",
	};
	expect(() => assertSupport(support, "msi")).not.toThrow();
	for (const change of [
		{ target: "windows-x86_64-msi" },
		{ installer: "nsis" },
		{ mode: "development" },
		{ reason: "conflicting-metadata" },
		{ platform: "linux" },
	]) {
		expect(() => assertSupport({ ...support, ...change }, "msi")).toThrow();
	}
});
