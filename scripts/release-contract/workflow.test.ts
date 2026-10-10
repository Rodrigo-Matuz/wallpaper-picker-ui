import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("verifies the final draft only after the complete two-platform matrix with read-only permissions", () => {
	const job = workflow().jobs.verify_release;
	expect(job?.needs).toBe("build");
	expect(job?.permissions).toEqual({ contents: "read" });
	expect(job?.["timeout-minutes"]).toBe(10);
	expect(job?.steps.map((step) => step.uses).filter(Boolean)).toEqual([
		"actions/checkout@v5",
		"oven-sh/setup-bun@v2",
	]);
	const step = job?.steps.find((step) => step.run);
	expect(step?.run).toBe("bun scripts/release-contract/verify.ts");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
	expect(step?.env).toEqual({ GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
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
