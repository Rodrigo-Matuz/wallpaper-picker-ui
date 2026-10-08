import type { Installer } from "./guards";
import { requireThat } from "./guards";

export interface ProcessIdentity {
	pid: number;
	path: string;
	startedUtc: string;
	peVersion: string;
	sha256: string;
}
export interface Registration {
	key: string;
	kind: string;
	version: string;
	installLocation?: string;
	displayIcon?: string;
	uninstallString?: string;
}
export function assertUpgrade(
	pre: ProcessIdentity,
	post: ProcessIdentity,
	before: Registration[],
	after: Registration[],
	hashesBefore: Record<string, string>,
	hashesAfter: Record<string, string>,
	kind: Installer,
	requestedUtc: string,
): void {
	requireThat(
		pre.peVersion === "3.6.0" || pre.peVersion === "3.6.0.0",
		"Baseline PE version mismatch",
	);
	requireThat(
		post.peVersion === "3.6.1" || post.peVersion === "3.6.1.0",
		"Updated PE version mismatch",
	);
	requireThat(
		pre.path.toLowerCase() === post.path.toLowerCase() && pre.sha256 !== post.sha256,
		"Executable path/replacement mismatch",
	);
	requireThat(
		(pre.pid !== post.pid || pre.startedUtc !== post.startedUtc) &&
			Date.parse(post.startedUtc) >= Date.parse(requestedUtc),
		"New installer-launched process identity required",
	);
	requireThat(
		before.length === 1 &&
			after.length === 1 &&
			before[0].kind === kind &&
			after[0].kind === kind &&
			before[0].version === "3.6.0" &&
			after[0].version === "3.6.1",
		"Duplicate/cross-installer/version registration mismatch",
	);
	if (kind === "nsis")
		requireThat(before[0].key === after[0].key, "NSIS registration identity changed");
	requireThat(
		before[0].installLocation === after[0].installLocation,
		"Installation location changed",
	);
	requireThat(
		Object.keys(hashesBefore).length === 4 && Object.keys(hashesAfter).length === 4,
		"Four fixture hashes required",
	);
	for (const key of ["config", "map", "cache", "video"])
		requireThat(
			hashesBefore[key] && hashesBefore[key] === hashesAfter[key],
			`Fixture changed: ${key}`,
		);
}

export interface Metadata {
	rid: number;
	currentVersion: string;
	version: string;
	rawJson: { version: string; platforms: Record<string, { url: string; signature: string }> };
}
export function assertMetadata(
	value: unknown,
	target: string,
	candidate: { version: string; url: string; signature: string; assetName: string },
): asserts value is Metadata {
	const m = value as Metadata;
	requireThat(
		m &&
			Number.isSafeInteger(m.rid) &&
			m.rid >= 0 &&
			m.currentVersion === "3.6.0" &&
			m.version === "3.6.1",
		"Plugin must offer exactly 3.6.0 to 3.6.1",
	);
	requireThat(
		["windows-x86_64-nsis", "windows-x86_64-msi"].includes(target),
		"Exact Windows target required",
	);
	const entry = m.rawJson?.platforms?.[target];
	const expectedUrl = `https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.1/${candidate.assetName}`;
	requireThat(
		candidate.version === "3.6.1" &&
			candidate.url === expectedUrl &&
			candidate.signature &&
			m.rawJson.version === "3.6.1" &&
			entry &&
			entry.url === candidate.url &&
			entry.signature === candidate.signature,
		"Live native feed differs from verified approved per-installer candidate",
	);
}

export function assertSupport(value: unknown, kind: Installer): void {
	const support = value as Record<string, unknown>;
	requireThat(
		support &&
			support.mode === "manual-only" &&
			support.platform === "windows" &&
			support.architecture === "x86_64" &&
			support.installer === kind &&
			support.target === null &&
			support.reason === "native-validation-pending",
		"Packaged installer policy mismatch; production target must remain null",
	);
}
