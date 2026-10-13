import type { UpdaterSnapshot } from "$types/updateTypes";

/** DOCS: External manual MSI link only; never authorizes native update actions. */
export function manualMsiDownload(snapshot: UpdaterSnapshot): string | null {
	const support = snapshot.support;
	const candidate = snapshot.availableUpdate;
	if (
		snapshot.status !== "available" ||
		snapshot.busy ||
		snapshot.failure ||
		snapshot.installBlocked ||
		snapshot.canUpdate ||
		snapshot.canDownload ||
		snapshot.canInstall ||
		!candidate ||
		support?.mode !== "manual-only" ||
		support.platform !== "windows" ||
		support.architecture !== "x86_64" ||
		support.installer !== "msi" ||
		support.checkTarget !== "windows-x86_64-msi" ||
		support.target !== null ||
		support.reason !== "native-validation-pending"
	) {
		return null;
	}
	const version = candidate.version;
	// Canonical SemVer subset of the maintained release contract: no tag prefix,
	// build metadata or URL metacharacters. Bound input before matching; reject
	// numeric prerelease leading zeroes and JavaScript's trailing-newline $ match.
	if (typeof version !== "string" || version.length > 64) return null;
	const match =
		/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?$/.exec(
			version,
		);
	if (match?.[0] !== version) return null;
	return `https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/Wallpaper.Picker.UI_${version}_x64_en-US.msi`;
}
