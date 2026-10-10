import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Only Bun workers run; each fixture mocks every native FS/IPC entry point.
for (const operation of ["read", "save", "clear", "cached-save"]) {
	for (const failure of ["exists", "mkdir"]) {
		test(`${operation} settles after directory ${failure} failure without queue recursion`, () => {
			const result = Bun.spawnSync(
				[
					process.execPath,
					"--no-install",
					"--no-env-file",
					"run",
					fileURLToPath(new URL("./directoryFailure.fixture.ts", import.meta.url)),
					operation,
					failure,
				],
				{ cwd: process.cwd(), timeout: 5000 },
			);
			const report = JSON.parse(new TextDecoder().decode(result.stdout));
			expect(report.outcome).toBe("settled");
			expect(result.exitCode).toBe(0);
			expect(report.pending).toBe(false);
			expect(report.effects.directoryFailures).toBeGreaterThan(0);
			if (operation.includes("save")) expect(report.command).toBe("retained");
			if (operation === "cached-save") expect(report.effects.logs).toBeGreaterThan(1);
			else expect(report.effects.logs).toBe(0);
		});
	}
}
