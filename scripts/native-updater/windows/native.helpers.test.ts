import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Only AST-extracted pure helpers execute, never native.ps1 or its action switch.
function runHelpers(scenario: string) {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("TMPDIR or hosted RUNNER_TEMP must name the scratch directory");
	return spawnSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			fileURLToPath(new URL("./native.helpers.test.ps1", import.meta.url)),
			"-NativeScript",
			fileURLToPath(new URL("./native.ps1", import.meta.url)),
			"-Scenario",
			scenario,
		],
		{
			encoding: "utf8",
			timeout: 30000,
			env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
		},
	);
}

test.skipIf(process.platform !== "win32")(
	"baseline MSI does not request auto-launch before fixture ownership",
	() => {
		const result = runHelpers("msi-install");
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS baseline MSI omits auto-launch property");
	},
	45000,
);

test.skipIf(process.platform !== "win32")(
	"NSIS discovery accepts the captured pair-quoted registration without changing raw values",
	() => {
		const result = runHelpers("nsis");
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS NSIS captured pair-quoted registration");
	},
	45000,
);

test.skipIf(process.platform !== "win32")(
	"coexistence discovery uses the secondary NSIS root and refuses it under the primary root",
	() => {
		const result = runHelpers("coexistence");
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS coexistence secondary-root discovery");
	},
	45000,
);

test.skipIf(process.platform !== "win32")(
	"reflection helpers preserve typed MSI method arguments",
	() => {
		const result = runHelpers("reflection");
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS managed reflection");
	},
	45000,
);

test.skipIf(process.platform !== "win32")(
	"reflection helpers preserve integer and two-string indexed MSI properties",
	() => {
		const result = runHelpers("properties");
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS managed properties");
	},
	45000,
);
