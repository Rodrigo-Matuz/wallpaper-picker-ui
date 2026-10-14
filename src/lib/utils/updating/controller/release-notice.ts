import type { AvailableUpdate, UpdateSupport } from "$types/updateTypes";

/** DOCS: Bounded, non-recursive SemVer parsing; retain decimal components to avoid numeric rounding. */
function parseVersion(raw: unknown): RegExpMatchArray {
	const match =
		typeof raw === "string" &&
		raw.length <= 256 &&
		raw.match(
			/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
		);
	if (
		!match ||
		match[4]?.split(".").some((id) => /^\d+$/.test(id) && id.length > 1 && id[0] === "0")
	)
		throw new Error("Invalid release manifest version");
	return match;
}

/** DOCS: Accept ISO calendar dates/RFC3339 timestamps only, rejecting Date.parse's calendar rollover. */
function validDate(raw: unknown): raw is string {
	if (typeof raw !== "string" || raw.length > 64) return false;
	const match = raw.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2})))?$/,
	);
	if (!match || !Number.isFinite(Date.parse(raw))) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return (
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= days[month - 1] &&
		(!match[4] ||
			(Number(match[4]) < 24 &&
				Number(match[5]) < 60 &&
				Number(match[6]) < 60 &&
				(!match[7] || (Number(match[7]) < 24 && Number(match[8]) < 60))))
	);
}

/** DOCS: Copies untrusted metadata only; malformed wire data throws, valid non-newer/unstable releases return null. */
export function readReleaseNotice(raw: unknown, currentVersion: string): AvailableUpdate | null {
	const current = parseVersion(currentVersion);
	if (raw === null) return null;
	if (typeof raw !== "object" || Array.isArray(raw) || raw === null)
		throw new Error("Invalid release manifest metadata");
	const {
		currentVersion: reportedCurrent,
		version,
		body: nativeBody,
		date: nativeDate,
	} = raw as Record<string, unknown>;
	const candidate = parseVersion(version);
	const body = nativeBody === null ? undefined : nativeBody;
	const date = nativeDate === null ? undefined : nativeDate;
	if (
		reportedCurrent !== currentVersion ||
		(body !== undefined && typeof body !== "string") ||
		(date !== undefined && !validDate(date))
	)
		throw new Error("Invalid release manifest metadata");
	if (candidate[4]) return null;
	let newer = !!current[4];
	for (let i = 1; i <= 3; i++) {
		if (candidate[i] === current[i]) continue;
		newer =
			candidate[i].length !== current[i].length
				? candidate[i].length > current[i].length
				: candidate[i] > current[i];
		break;
	}
	return newer ? Object.freeze({ currentVersion, version: version as string, body, date }) : null;
}

/** DOCS: Pure, exact native provenance key for resource-free Linux notices; never grants install authority. */
export function releaseNoticeProvenance(support: UpdateSupport): string | null {
	if (
		support.platform !== "linux" ||
		support.architecture !== "x86_64" ||
		support.target !== null
	)
		return null;
	const managed =
		support.mode === "package-managed" &&
		(!("checkTarget" in support) || support.checkTarget === null) &&
		(((support.installer === "deb" || support.installer === "rpm") &&
			support.reason === "package-managed") ||
			(support.installer === "nix" && support.reason === "nix-managed"));
	const appImage =
		support.mode === "manual-only" &&
		support.installer === "appimage" &&
		support.checkTarget === "linux-x86_64-appimage" &&
		(support.reason === "native-validation-pending" ||
			support.reason === "app-image-read-only");
	if (!managed && !appImage) return null;
	return JSON.stringify([
		support.mode,
		support.platform,
		support.architecture,
		support.installer,
		support.target,
		"checkTarget" in support,
		support.checkTarget,
		support.reason,
	]);
}
