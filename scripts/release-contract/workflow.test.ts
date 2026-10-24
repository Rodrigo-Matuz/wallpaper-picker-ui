import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("grants draft visibility after the full matrix without persisting write credentials or publishing", () => {
	const { build, verify_release: job } = workflow().jobs;
	expect(job?.needs).toBe("build");
	expect(job?.permissions).toEqual({ contents: "write" });
	expect(job?.["timeout-minutes"]).toBe(10);
	expect(job?.steps).toHaveLength(3);
	expect(job?.steps.map((step) => step.uses).filter(Boolean)).toEqual([
		"actions/checkout@v5",
		"oven-sh/setup-bun@v2",
	]);
	const checkout = job?.steps.find((step) => step.uses === "actions/checkout@v5");
	expect(checkout?.with).toEqual({ "persist-credentials": false });
	const runSteps = job?.steps.filter((step) => step.run);
	expect(runSteps).toHaveLength(1);
	const step = runSteps?.[0];
	expect(step?.run).toBe("bun scripts/release-contract/verify.ts");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
	expect(step?.env).toEqual({ GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
	expect(build.strategy?.matrix.include).toEqual([
		{ os: "ubuntu-22.04", bundles: "deb,rpm,appimage" },
		{ os: "windows-latest", bundles: "nsis" },
	]);
	expect(build.strategy?.["max-parallel"]).toBe(1);
	const bundler = build.steps.find((step) => step.uses === "tauri-apps/tauri-action@v1");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
	expect(bundler?.with?.args).toBe("--bundles ${{ matrix.bundles }}");
	const action = build.steps.find((step) => step.uses === "tauri-apps/tauri-action@v1");
	expect(action?.with?.releaseDraft).toBe(true);
	expect(action?.with?.prerelease).toBe(false);
	expect(action?.with?.releaseBody).toContain("Added selectable theme families");
	expect(action?.with?.releaseBody).toContain("independent global controls");
	expect(action?.with?.releaseBody).toContain("Home Manager options");
	expect(action?.with?.releaseBody).toContain("DeepOcean preview icons now remain blue");
	expect(action?.with?.releaseBody).toContain("Custom `$VP` paths");
	expect(action?.with?.releaseBody).not.toContain("installation");
	expect(action?.with?.releaseBody).not.toContain("Update");
});

const workflow = () =>
	Bun.YAML.parse(
		readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8"),
	) as {
		on: { push: { tags: string[] } };
		jobs: Record<
			string,
			{
				needs?: string;
				permissions: Record<string, string>;
				"runs-on": string;
				"timeout-minutes"?: number;
				strategy?: {
					"max-parallel"?: number;
					matrix: { include: { os: string; bundles: string }[] };
				};
				steps: {
					uses?: string;
					run?: string;
					env?: Record<string, string>;
					with?: Record<string, unknown>;
				}[];
			}
		>;
	};

const releaseNotes = () =>
	readFileSync(new URL("../../RELEASE.md", import.meta.url), "utf8").replace(
		/^# Release notes\s*\r?\n/,
		"",
	);

test("makes updater JSON, NSIS alias preference and generated release notes explicit", () => {
	const action = workflow().jobs.build.steps.find(
		(step) => step.uses === "tauri-apps/tauri-action@v1",
	);
	expect(action?.with?.uploadUpdaterJson).toBe(true);
	expect(action?.with?.updaterJsonPreferNsis).toBe(true);
	expect(action?.with?.generateReleaseNotes).toBe(true);
	expect(action?.with?.releaseBody).not.toBe(
		"See the assets to download and install this version.",
	);
});

test("keeps release notes concise and limited to features and fixes", () => {
	const action = workflow().jobs.build.steps.find(
		(step) => step.uses === "tauri-apps/tauri-action@v1",
	);
	const body = String(action?.with?.releaseBody);
	expect(body).toContain("## New");
	expect(body).toContain("## Fixed");
	expect(body).toContain("Arctic and Orchid");
	expect(body).toContain("Home Manager options");
	expect(body).toContain("Custom `$VP` paths");
	expect(body).toContain("WebKitGTK layout metrics");
	expect(body.trim()).toBe(releaseNotes().trim());
	expect(body).not.toContain("installation");
	expect(body).not.toContain("installer");
	expect(body).not.toContain("Update");
	expect(body).not.toContain("github.ref_name");
	expect(body).not.toContain("TEST RELEASE");
	expect(body).not.toContain("may be deleted soon");
	expect(body).not.toContain("docs/");
});

test("limits default bundle targets to NSIS and the existing Linux packages", () => {
	const config = JSON.parse(
		readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
	);
	expect(config.bundle.targets).toEqual(["nsis", "appimage", "deb", "rpm"]);
	expect(config.bundle.createUpdaterArtifacts).toBe(true);
	expect(config.bundle.windows.nsis.installMode).toBe("currentUser");
	expect(config.bundle.windows.wix.upgradeCode).toBe("83118bd9-967b-5a1f-94be-e18868474288");
});

test("requires the signed artifact version to match the announced update version", () => {
	const config = JSON.parse(
		readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
	) as { plugins: { updater: { requireSignedVersion?: boolean } } };
	expect(config.plugins.updater.requireSignedVersion).toBe(true);
});

test("rejects Windows installer downgrades as well as updater-check downgrades", () => {
	const config = JSON.parse(
		readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
	) as {
		bundle: { windows: { allowDowngrades?: boolean } };
		plugins: { updater: { allowDowngrades: boolean } };
	};
	expect(config.bundle.windows.allowDowngrades).toBe(false);
	expect(config.plugins.updater.allowDowngrades).toBe(false);
});
