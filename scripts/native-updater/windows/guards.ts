import { win32 as path } from "node:path";

export type Installer = "nsis" | "msi";
export type AcceptanceCase = Installer | "coexistence";
export interface Artifact {
	version: string;
	artifactPath: string;
	assetName: string;
	sha256: string;
	size: number;
	target: string;
	url: string;
	signature: string;
	sha256AndSizeVerified: boolean;
}
export interface Manifest {
	caseRoot: string;
	target: `windows-x86_64-${Installer}`;
	baseline: Artifact;
	candidate: Artifact;
	otherBaseline?: Artifact;
}

export function requireThat(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export function ownedPath(root: string, candidate: string): string {
	requireThat(
		path.isAbsolute(root) && path.isAbsolute(candidate),
		"Absolute Windows paths required",
	);
	const relative = path.relative(root, candidate);
	requireThat(
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
		"Path must be strictly inside owned root",
	);
	requireThat(
		!candidate.startsWith("\\\\") && !candidate.includes(":", 2),
		"UNC/alternate data stream path refused",
	);
	return candidate;
}

export function validateManifest(value: unknown, testCase: string, runnerTemp: string): Manifest {
	requireThat(["nsis", "msi", "coexistence"].includes(testCase), "Unknown acceptance case");
	requireThat(value !== null && typeof value === "object", "Manifest required");
	const m = value as Manifest;
	ownedPath(path.join(runnerTemp, "native-updater-acceptance"), m.caseRoot);
	const kind =
		m.target === "windows-x86_64-nsis"
			? "nsis"
			: m.target === "windows-x86_64-msi"
				? "msi"
				: null;
	requireThat(
		kind && (testCase === "coexistence" || testCase === kind),
		"Exact matching installer target required",
	);
	const validate = (a: Artifact, version: string, installer: Installer) => {
		requireThat(a && a.version === version, `Only approved ${version} allowed`);
		ownedPath(m.caseRoot, a.artifactPath);
		const suffix = installer === "nsis" ? "x64-setup.exe" : "x64_en-US.msi";
		requireThat(
			a.assetName === `Wallpaper.Picker.UI_${version}_${suffix}`,
			"Wrong published installer asset",
		);
		requireThat(
			a.sha256AndSizeVerified === true &&
				Number.isSafeInteger(a.size) &&
				a.size > 0 &&
				a.target === `windows-x86_64-${installer}` &&
				typeof a.signature === "string" &&
				a.signature.length > 0,
			"Shared verified artifact metadata required",
		);
		requireThat(
			a.url ===
				`https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/${a.assetName}`,
			"Untrusted published artifact URL",
		);
		requireThat(
			typeof a.sha256 === "string" && /^[a-f0-9]{64}$/.test(a.sha256),
			"Verified SHA-256 required",
		);
	};
	validate(m.baseline, "3.6.0", kind);
	validate(m.candidate, "3.6.1", kind);
	requireThat(
		m.baseline.artifactPath !== m.candidate.artifactPath,
		"Distinct artifact paths required",
	);
	return m;
}

export function assertHostedWindows(env: Record<string, string | undefined>, platform: string) {
	const required = {
		GITHUB_ACTIONS: "true",
		RUNNER_ENVIRONMENT: "github-hosted",
		RUNNER_OS: "Windows",
		WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
	};
	if (platform !== "win32") throw new Error("Native acceptance requires Windows");
	for (const [key, value] of Object.entries(required)) {
		if (env[key] !== value) throw new Error(`Native acceptance refused: ${key}`);
	}
}
