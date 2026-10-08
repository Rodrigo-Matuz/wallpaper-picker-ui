import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { verifyCaseRoot } from "./ownership";

test.skipIf(process.platform !== "win32")(
	"PowerShell entry root guard refuses unrelated and junction roots without native actions",
	async () => {
		const source = await readFile(new URL("./native.ps1", import.meta.url), "utf8");
		// Execute only the real filesystem root-guard prefix, never native.ps1 or its action switch.
		const guard = source.slice(source.indexOf("$root ="), source.indexOf("function OwnedFile"));
		expect(guard).not.toBe("");
		expect(guard).not.toMatch(/Registrations|Processes|Start-Process|Get-CimInstance|switch/);
		const temp = await mkdtemp(join(import.meta.dir, ".ownership-ps-test-"));
		try {
			const allowed = join(temp, "native-updater-acceptance");
			await mkdir(join(allowed, "valid"), { recursive: true });
			await mkdir(join(temp, "unrelated", "case"), { recursive: true });
			await symlink(join(temp, "unrelated"), join(allowed, "linked"), "junction");
			const check = (root: string) => {
				const input = Buffer.from(
					JSON.stringify({ caseRoot: root, runnerTemp: temp }),
				).toString("base64");
				return spawnSync(
					"powershell.exe",
					[
						"-NoProfile",
						"-NonInteractive",
						"-Command",
						`$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${input}')) | ConvertFrom-Json; $env:RUNNER_TEMP=$p.runnerTemp; ${guard}; Write-Output 'accepted'`,
					],
					{ encoding: "utf8", timeout: 15000 },
				);
			};
			const valid = check(join(allowed, "valid"));
			expect(valid.error).toBeUndefined();
			expect(valid.status).toBe(0);
			expect(valid.stdout.trim()).toBe("accepted");
			for (const root of [
				join(temp, "unrelated", "case"),
				allowed,
				join(allowed, "linked", "case"),
			]) {
				const refused = check(root);
				expect(refused.error).toBeUndefined();
				expect(refused.status).toBe(1);
			}
		} finally {
			await rm(temp, { recursive: true, force: true });
		}
	},
	75000,
);

// Filesystem-only guards. Never invoke native.ps1 actions or pretend this is native acceptance.
test.skipIf(process.platform !== "win32")(
	"case-root guard rejects an ancestor junction before driver writes",
	async () => {
		const temp = await mkdtemp(join(import.meta.dir, ".ownership-test-"));
		try {
			const allowed = join(temp, "native-updater-acceptance");
			const outside = join(temp, "unrelated");
			await mkdir(join(allowed, "valid"), { recursive: true });
			await mkdir(join(outside, "case"), { recursive: true });
			await symlink(outside, join(allowed, "linked"), "junction");
			await expect(verifyCaseRoot(temp, join(allowed, "valid"))).resolves.toBeUndefined();
			const child = spawnSync(
				process.execPath,
				[
					"--eval",
					`import { verifyCaseRoot } from ${JSON.stringify(new URL("./ownership.ts", import.meta.url).href)}; await verifyCaseRoot(${JSON.stringify(`${temp}\\`)}, ${JSON.stringify(join(allowed, "valid"))});`,
				],
				{ encoding: "utf8", timeout: 2000 },
			);
			expect(child.error).toBeUndefined();
			expect(child.status).toBe(0);
			await expect(verifyCaseRoot(temp, join(allowed, "linked", "case"))).rejects.toThrow();
		} finally {
			await rm(temp, { recursive: true, force: true });
		}
	},
);
