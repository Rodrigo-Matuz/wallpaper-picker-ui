import { expect, test } from "bun:test";
import { assertHostedWindows, type Manifest, validateManifest } from "./guards";

const manifest: Manifest = {
	caseRoot: "D:/a/_temp/native-updater-acceptance/run1",
	target: "windows-x86_64-nsis",
	baseline: {
		version: "3.6.0",
		artifactPath: "D:/a/_temp/native-updater-acceptance/run1/a.exe",
		assetName: "Wallpaper.Picker.UI_3.6.0_x64-setup.exe",
		sha256: "a".repeat(64),
		size: 1,
		target: "windows-x86_64-nsis",
		signature: "signed",
		url: "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.0/Wallpaper.Picker.UI_3.6.0_x64-setup.exe",
		sha256AndSizeVerified: true,
	},
	candidate: {
		version: "3.6.1",
		artifactPath: "D:/a/_temp/native-updater-acceptance/run1/b.exe",
		assetName: "Wallpaper.Picker.UI_3.6.1_x64-setup.exe",
		sha256: "b".repeat(64),
		size: 1,
		target: "windows-x86_64-nsis",
		signature: "signed",
		url: "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.1/Wallpaper.Picker.UI_3.6.1_x64-setup.exe",
		sha256AndSizeVerified: true,
	},
};

test("manifest pins exact versions, per-installer assets, and run-owned paths", () => {
	expect(validateManifest(manifest, "nsis", "D:/a/_temp")).toEqual(manifest);
	for (const invalid of [
		{ ...manifest, candidate: { ...manifest.candidate, sha256AndSizeVerified: false } },
		{
			...manifest,
			candidate: { ...manifest.candidate, url: "https://evil.invalid/installer" },
		},
		{ ...manifest, target: "windows-x86_64" },
		{ ...manifest, caseRoot: "D:/a/_temp" },
		{ ...manifest, caseRoot: "C:/Users/real" },
		{ ...manifest, baseline: { ...manifest.baseline, version: "3.5.0" } },
		{ ...manifest, candidate: { ...manifest.candidate, sha256: "bad" } },
		{ ...manifest, candidate: { ...manifest.candidate, artifactPath: "D:/outside.exe" } },
		{
			...manifest,
			candidate: {
				...manifest.candidate,
				assetName: "Wallpaper.Picker.UI_3.6.1_x64_en-US.msi",
			},
		},
	])
		expect(() => validateManifest(invalid, "nsis", "D:/a/_temp")).toThrow();
	expect(() => validateManifest(manifest, "msi", "D:/a/_temp")).toThrow();
});

test("manifest refuses unrelated runner-temp children and the acceptance root itself", () => {
	for (const caseRoot of [
		"D:/a/_temp/unrelated/run1",
		"D:/a/_temp/native-updater-acceptance",
		"D:/a/_temp/native-updater-acceptance-sibling/run1",
	]) {
		const relocated = {
			...manifest,
			caseRoot,
			baseline: { ...manifest.baseline, artifactPath: `${caseRoot}/a.exe` },
			candidate: { ...manifest.candidate, artifactPath: `${caseRoot}/b.exe` },
		};
		expect(() => validateManifest(relocated, "nsis", "D:/a/_temp")).toThrow(
			"Path must be strictly inside owned root",
		);
	}
});

const approved = {
	GITHUB_ACTIONS: "true",
	RUNNER_ENVIRONMENT: "github-hosted",
	RUNNER_OS: "Windows",
	WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
};

test("host guard permits only explicitly opted-in hosted Windows", () => {
	expect(() => assertHostedWindows(approved, "win32")).not.toThrow();
	for (const key of Object.keys(approved)) {
		for (const value of [undefined, "", "false", "TRUE", "self-hosted", "Linux"]) {
			expect(() => assertHostedWindows({ ...approved, [key]: value }, "win32")).toThrow();
		}
	}
	for (const platform of ["linux", "darwin"]) {
		expect(() => assertHostedWindows(approved, platform)).toThrow();
	}
});
