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
		{ os: "ubuntu-22.04" },
		{ os: "windows-latest" },
	]);
	const action = build.steps.find((step) => step.uses === "tauri-apps/tauri-action@v0");
	expect(action?.with?.releaseDraft).toBe(true);
	expect(action?.with?.prerelease).toBe(false);
	expect(action?.with?.releaseBody).toContain("before manually publishing this draft");
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
				strategy?: { matrix: { include: { os: string }[] } };
				steps: {
					uses?: string;
					run?: string;
					env?: Record<string, string>;
					with?: Record<string, unknown>;
				}[];
			}
		>;
	};

test("makes updater JSON, existing MSI alias preference and generated release notes explicit", () => {
	const action = workflow().jobs.build.steps.find(
		(step) => step.uses === "tauri-apps/tauri-action@v0",
	);
	expect(action?.with?.includeUpdaterJson).toBe(true);
	expect(action?.with?.updaterJsonPreferNsis).toBe(false);
	expect(action?.with?.generateReleaseNotes).toBe(true);
	expect(action?.with?.releaseBody).not.toBe(
		"See the assets to download and install this version.",
	);
});

test("warns that the two official updater trial releases are temporary and unverified", () => {
	const action = workflow().jobs.build.steps.find(
		(step) => step.uses === "tauri-apps/tauri-action@v0",
	);
	const body = String(action?.with?.releaseBody);
	expect(body).toContain("github.ref_name == 'v3.6.2'");
	expect(body).toContain("github.ref_name == 'v3.6.3'");
	expect(body).toContain("published specifically to test in-app updating");
	expect(body).toContain("may be deleted soon");
	expect(body).toContain("Back up your settings and app data before testing");
	expect(body).toContain("Native upgrade/restart/data preservation is not yet verified");
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
