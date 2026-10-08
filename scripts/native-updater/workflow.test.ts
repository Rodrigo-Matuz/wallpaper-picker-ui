import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dir, "../../.github/workflows/native-updater-acceptance.yml");
const text = existsSync(path) ? readFileSync(path, "utf8") : "";
const workflow = Bun.YAML.parse(text) as {
	on: Record<string, unknown>;
	permissions: Record<string, string>;
	jobs: Record<
		string,
		{
			"runs-on": string;
			"timeout-minutes": number;
			strategy: { matrix: { include: { case: string; target: string }[] } };
			env: Record<string, string>;
			steps: {
				name?: string;
				run?: string;
				if?: string;
				env?: Record<string, string>;
				"continue-on-error"?: boolean;
				uses?: string;
				with?: Record<string, unknown>;
			}[];
		}
	>;
};

test("native acceptance is manual-only, read-only, and never uses signing secrets", () => {
	expect(existsSync(path)).toBe(true);
	expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
	expect(workflow.permissions).toEqual({ contents: "read" });
	expect(text).not.toContain("secrets.");
	expect(text).not.toContain("workflow_call");
	expect(text).not.toContain("tags:");
});

test("all native cases are isolated hosted jobs with opt-in and bounded lifetime", () => {
	expect(workflow.jobs.windows["runs-on"]).toBe("windows-latest");
	expect(workflow.jobs.linux["runs-on"]).toBe("ubuntu-22.04");
	expect(workflow.jobs.windows.strategy.matrix.include.map((row) => row.case)).toEqual([
		"nsis",
		"msi",
		"coexistence",
	]);
	expect(workflow.jobs.linux.strategy.matrix.include.map((row) => row.case)).toEqual([
		"writable",
		"readonly",
	]);
	for (const job of Object.values(workflow.jobs)) {
		expect(job.env.WALLPAPER_PICKER_NATIVE_ACCEPTANCE).toBe("1");
		expect(job["timeout-minutes"]).toBeGreaterThan(0);
		expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
		for (const step of job.steps) {
			if (step.uses)
				expect(step.uses).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+@[a-f0-9]{40}$/);
		}
		const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
		expect(checkout?.with?.["persist-credentials"]).toBe(false);
	}
});

test("Linux Python contracts execute before any native setup or launch", () => {
	const steps = workflow.jobs.linux.steps;
	const testIndex = steps.findIndex((step) =>
		step.run?.includes("python -B -m unittest discover -s scripts/native-updater/linux"),
	);
	expect(testIndex).toBeGreaterThanOrEqual(0);
	const setupIndex = steps.findIndex((step) => step.run?.includes("sudo apt-get"));
	const probeIndex = steps.findIndex((step) =>
		step.run?.includes("bun scripts/native-updater/linux/run.ts"),
	);
	expect(setupIndex).toBeGreaterThan(testIndex);
	expect(probeIndex).toBeGreaterThan(setupIndex);
});

test("Linux probe is explicitly feasibility-only with no wrapper or masked failure", () => {
	const probe = workflow.jobs.linux.steps.find((step) =>
		step.run?.includes("bun scripts/native-updater/linux/run.ts"),
	);
	expect(probe?.name).toContain("feasibility");
	expect(probe?.name).toContain("not acceptance");
	expect(probe?.run).not.toContain("xvfb-run");
	expect(probe?.run).not.toContain("dbus-run-session");
	expect(probe?.run).not.toMatch(/\|\|\s*(true|:)|exit\s+0/);
	expect(probe?.["continue-on-error"]).not.toBe(true);
	const upload = workflow.jobs.linux.steps.find((step) =>
		step.uses?.startsWith("actions/upload-artifact@"),
	);
	expect(upload?.if).toBe("always()");
});

test("Windows dispatch defaults to explicit diagnostic-only mode without masking failure", () => {
	const dispatch = workflow.on.workflow_dispatch as {
		inputs?: {
			diagnostic_only?: {
				type: string;
				default: boolean;
				required: boolean;
				description: string;
			};
		};
	} | null;
	expect(dispatch?.inputs?.diagnostic_only).toMatchObject({
		type: "boolean",
		default: true,
		required: true,
	});
	expect(dispatch?.inputs?.diagnostic_only?.description).toContain("not acceptance");
	const probe = workflow.jobs.windows.steps.find((step) =>
		step.run?.includes("bun scripts/native-updater/windows/run.ts"),
	);
	expect(probe?.env?.WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY).toBe(
		// biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal GitHub Actions syntax, not JavaScript interpolation.
		"${{ inputs.diagnostic_only && '1' || '0' }}",
	);
	expect(probe?.name).toContain("diagnostic");
	expect(probe?.env).not.toHaveProperty("GITHUB_TOKEN");
	expect(probe?.run).not.toMatch(/\|\|\s*(true|:)|exit\s+0/);
	expect(probe?.["continue-on-error"]).not.toBe(true);
	const upload = workflow.jobs.windows.steps.find((step) =>
		step.uses?.startsWith("actions/upload-artifact@"),
	);
	expect(upload?.if).toBe("always()");
});

test("Linux feasibility installs the WebKitWebDriver diagnostic binary", () => {
	const setup = workflow.jobs.linux.steps.find((step) =>
		step.run?.includes("sudo apt-get install"),
	);
	expect(setup?.run).toContain("webkit2gtk-driver");
});
