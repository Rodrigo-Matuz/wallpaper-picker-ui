import { describe, expect, it } from "bun:test";
import type { UpdaterSnapshot } from "$types/updateTypes";
import { manualMsiDownload } from "./manual-download";

const availableMsi: UpdaterSnapshot = {
	status: "available",
	busy: null,
	progress: null,
	currentVersion: "3.6.2",
	support: {
		mode: "manual-only",
		platform: "windows",
		architecture: "x86_64",
		installer: "msi",
		target: null,
		checkTarget: "windows-x86_64-msi",
		reason: "native-validation-pending",
	},
	availableUpdate: { currentVersion: "3.6.2", version: "3.6.3" },
	failure: null,
	lastCheckedAt: 1700000000000,
	canCheck: true,
	canRetry: false,
	canDownload: false,
	canInstall: false,
	canUpdate: false,
	installBlocked: false,
};

// Test corrupted runtime metadata as well as the public typed snapshot.
function candidate(version: unknown): UpdaterSnapshot {
	return {
		...availableMsi,
		availableUpdate: { currentVersion: "3.6.2", version },
	} as UpdaterSnapshot;
}

describe("manual MSI URL (pure presentation, not verified bytes)", () => {
	it.each([
		["mode", "self-managed"],
		["mode", "development"],
		["mode", "package-managed"],
		["mode", "unknown"],
		["platform", "linux"],
		["platform", "browser"],
		["platform", "Windows"],
		["architecture", "aarch64"],
		["architecture", "x64"],
		["installer", "nsis"],
		["installer", "appimage"],
		["installer", "deb"],
		["installer", "rpm"],
		["installer", "nix"],
		["installer", null],
		["checkTarget", null],
		["checkTarget", undefined],
		["checkTarget", "windows-x86_64"],
		["checkTarget", "windows-x86_64-nsis"],
		["checkTarget", "linux-x86_64-appimage"],
		["target", undefined],
		["target", "windows-x86_64-msi"],
		["target", "windows-x86_64-nsis"],
		["reason", "supported"],
		["reason", "unknown-installation"],
		["reason", "app-image-read-only"],
	] as const)("rejects contradictory or unsupported %s = %s even with a candidate", (key, value) => {
		const support = { ...availableMsi.support, [key]: value };
		expect(manualMsiDownload({ ...availableMsi, support } as UpdaterSnapshot)).toBeNull();
	});
	it.each([null, undefined, {}])("rejects absent or incomplete support %#", (support) => {
		expect(manualMsiDownload({ ...availableMsi, support } as UpdaterSnapshot)).toBeNull();
	});
	it.each([
		"idle",
		"checking",
		"up-to-date",
		"manual-only",
		"error",
		"downloading",
		"ready-to-install",
		"installing",
		"installer-handoff",
		"restarting",
		"restart-required",
	] as const)("rejects stale candidate metadata in status %s", (status) => {
		expect(manualMsiDownload({ ...availableMsi, status })).toBeNull();
	});
	it.each([
		"check",
		"dismiss",
		"download",
		"install",
		"restart",
		"update",
	] as const)("rejects busy operation %s", (busy) => {
		expect(manualMsiDownload({ ...availableMsi, busy })).toBeNull();
	});
	it.each([
		"support",
		"check",
		"cleanup",
		"download",
		"install",
		"restart",
	] as const)("rejects retained candidate with %s failure", (phase) => {
		expect(
			manualMsiDownload({ ...availableMsi, failure: { phase, category: "unknown" } }),
		).toBeNull();
	});
	it.each([
		"canDownload",
		"canInstall",
		"canUpdate",
		"installBlocked",
	] as const)("rejects contradictory %s authority/blocking", (key) => {
		expect(manualMsiDownload({ ...availableMsi, [key]: true })).toBeNull();
	});
	it("rejects absent candidate metadata", () => {
		expect(manualMsiDownload({ ...availableMsi, availableUpdate: null })).toBeNull();
	});
	it("preserves the exact maximum accepted version length", () => {
		const version = `3.6.3-${"a".repeat(58)}`;
		expect(version).toHaveLength(64);
		expect(manualMsiDownload(candidate(version))).toBe(
			`https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/Wallpaper.Picker.UI_${version}_x64_en-US.msi`,
		);
		expect(manualMsiDownload(candidate(`${version}a`))).toBeNull();
	});
	it.each([
		"3.6.3",
		"0.1.0",
		"3.7.0-beta.1",
		"3.7.0-rc-2",
		"3.7.0-0",
	])("uses the exact canonical release version %s without normalization", (version) => {
		expect(manualMsiDownload(candidate(version))).toBe(
			`https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/Wallpaper.Picker.UI_${version}_x64_en-US.msi`,
		);
	});
	it.each([
		null,
		undefined,
		363,
		{},
		"",
		"unknown",
		"latest",
		"v3.6.3",
		"V3.6.3",
		" 3.6.3",
		"3.6.3 ",
		"3.6.3\n",
		"3.6",
		"03.6.3",
		"3.06.3",
		"3.6.03",
		"3.6.3/other",
		"3.6.3%2Fother",
		"3.6.3?x",
		"3.6.3#x",
		"3.6.3+build.1",
		"3.6.3-",
		"3.6.3-beta..1",
		"3.6.3-01",
		"3.6.3-beta.01",
		"3.6.3-β",
		`3.6.3-${"a".repeat(65)}`,
	])("rejects unsafe, unknown or noncanonical version %#", (version) => {
		expect(manualMsiDownload(candidate(version))).toBeNull();
	});
});
