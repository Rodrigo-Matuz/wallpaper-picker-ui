import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stopWithComparisons } from "./cleanup-diagnostics";

test.skipIf(process.platform !== "win32")(
	"managed stop seam persists exact operands without weakening termination guards",
	() => {
		const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
		if (!scratch) throw new Error("Task scratch TMPDIR required");
		const result = spawnSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				fileURLToPath(new URL("./native.stop.test.ps1", import.meta.url)),
				"-NativeScript",
				fileURLToPath(new URL("./native.ps1", import.meta.url)),
			],
			{
				encoding: "utf8",
				timeout: 30000,
				env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
			},
		);
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PASS 14 managed stop cases");
	},
	45000,
);

for (const scenario of [
	"equal",
	"plus-one-tick",
	"existing-diagnostic",
	"existing-diagnostic-mismatch",
]) {
	test.skipIf(process.platform !== "win32")(
		`managed writer-to-reader ownership: ${scenario}`,
		async () => {
			const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
			if (!scratch) throw new Error("Task-owned scratch required");
			const root = await mkdtemp(join(scratch, "native-stop-integrated-"));
			const caseRoot = join(root, "managed-stop", scenario);
			let evidence:
				| Awaited<ReturnType<typeof import("./cleanup-diagnostics").readStopComparisons>>
				| undefined;
			let output = "";
			try {
				const operation = stopWithComparisons(
					caseRoot,
					async (invocation, consume) => {
						const result = spawnSync(
							"powershell.exe",
							[
								"-NoProfile",
								"-NonInteractive",
								"-ExecutionPolicy",
								"Bypass",
								"-File",
								fileURLToPath(new URL("./native.stop.test.ps1", import.meta.url)),
								"-NativeScript",
								fileURLToPath(new URL("./native.ps1", import.meta.url)),
								"-EvidenceRoot",
								root,
								"-StopInvocation",
								invocation,
								"-ExportScenario",
								scenario,
							],
							{
								encoding: "utf8",
								timeout: 30000,
								env: {
									...process.env,
									TEMP: scratch,
									TMP: scratch,
									TMPDIR: scratch,
								},
							},
						);
						expect(result.error).toBeUndefined();
						output = result.stdout;
						const resultText = consume(result.stdout);
						if (result.status !== 0) throw new Error(result.stderr);
						expect(result.stderr).toBe("");
						return JSON.parse(resultText);
					},
					(value) => {
						evidence = value;
					},
				);
				if (scenario.endsWith("mismatch") || scenario === "plus-one-tick") {
					await expect(operation).rejects.toThrow(
						"Owned process identity changed before termination",
					);
				} else {
					const result = await operation;
					expect(result.stopped[0].pid).toBe(scenario === "equal" ? 123 : 456);
				}
				if (scenario.startsWith("existing")) {
					expect(output).not.toContain("WP_STOP_CLAIM:");
					expect(evidence).toEqual({
						state: "unknown",
						reason: "missing-or-invalid-owned-stop-evidence",
					});
					const stale = await readFile(join(caseRoot, "stop-comparison.json"), "utf8");
					expect(JSON.parse(stale).first.requestedPid).toBe(123);
					expect(stale).toBe(
						await readFile(
							join(root, "managed-stop", "equal", "stop-comparison.json"),
							"utf8",
						),
					);
				} else {
					expect(output).toContain("WP_STOP_CLAIM:");
					expect(evidence?.state).toBe("observed");
					if (evidence?.state === "observed")
						expect(evidence.first.requestedPid).toBe(123);
				}
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		},
		45000,
	);
}
