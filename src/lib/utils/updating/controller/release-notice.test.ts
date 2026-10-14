import { describe, expect, test } from "bun:test";
import type { UpdateSupport } from "$types/updateTypes";
import { readReleaseNotice, releaseNoticeProvenance } from "./release-notice";

const current = "3.6.9";
const notice = { currentVersion: current, version: "3.7.0", body: null, date: null };
const appImage: UpdateSupport = {
	mode: "manual-only",
	platform: "linux",
	architecture: "x86_64",
	installer: "appimage",
	target: null,
	checkTarget: "linux-x86_64-appimage",
	reason: "native-validation-pending",
};

describe("pure release notice policy", () => {
	test.each([
		{ ...notice, version: "3.7.0\n" },
		{ ...notice, version: "3.7.0\r\n" },
		{ ...notice, date: "2026-10-14\n" },
	])("rejects trailing manifest data rather than normalizing it: %j", (raw) => {
		expect(() => readReleaseNotice(raw, current)).toThrow("Invalid release manifest");
	});

	test.each([
		["3.6.9-beta.1", "3.6.9", true],
		["3.6.9-beta.1+build", "3.6.9+other", true],
		["3.6.9-beta.1", "3.6.8", false],
		["3.6.9+build", "3.6.9+other", false],
		["3.9.9", "3.10.0", true],
		["3.99.99", "4.0.0", true],
		["4.0.0", "3.99.99", false],
		["3.6.9007199254740992", "3.6.9007199254740993", true],
		["3.6.9007199254740993", "3.6.9007199254740992", false],
	])("compares stable %s -> %s semantically without numeric rounding", (currentVersion, version, newer) => {
		const result = readReleaseNotice({ ...notice, currentVersion, version }, currentVersion);
		expect(result?.version ?? null).toBe(newer ? version : null);
	});

	test.each([
		"unknown",
		"v3.6.9",
		"3.06.9",
		"3.6",
		"3.6.9-beta.01",
		"3.6.9\n",
	])("fails closed for invalid current version %j", (currentVersion) => {
		expect(() => readReleaseNotice({ ...notice, currentVersion }, currentVersion)).toThrow();
		expect(() => readReleaseNotice(null, currentVersion)).toThrow();
	});

	test.each([
		undefined,
		null,
		"2024-02-29",
		"2026-10-14T13:30:00.123456789-03:00",
	])("copies nullable metadata and valid dates: %j", (date) => {
		const raw = {
			...notice,
			date,
			rid: 42,
			close: () => {
				throw new Error("not a resource");
			},
		};
		const result = readReleaseNotice(raw, current);
		expect(result).toEqual({
			currentVersion: current,
			version: notice.version,
			body: undefined,
			date: date ?? undefined,
		});
		expect(Object.isFrozen(result)).toBe(true);
		expect(result).not.toHaveProperty("rid");
		expect(result).not.toHaveProperty("close");
	});

	test.each([
		{ mode: "development" },
		{ mode: "unknown" },
		{ mode: "self-managed" },
		{ platform: "windows" },
		{ platform: "unknown" },
		{ architecture: "aarch64" },
		{ target: "linux-x86_64-appimage" },
		{ checkTarget: null },
		{ checkTarget: undefined },
		{ checkTarget: "windows-x86_64-nsis" },
		{ installer: "deb" },
		{ installer: "nix" },
		{ reason: "appimage-read-only" },
		{ reason: "supported" },
	])("rejects incomplete or contradictory AppImage provenance: %j", (changes) => {
		expect(releaseNoticeProvenance({ ...appImage, ...changes } as UpdateSupport)).toBeNull();
	});
});
