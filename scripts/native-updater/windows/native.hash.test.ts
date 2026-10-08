import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test.skipIf(process.platform !== "win32")(
	"real process hash seam works without Get-FileHash and releases inert files on success/error",
	async () => {
		const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
		if (!scratch) throw new Error("Explicit TMPDIR or hosted RUNNER_TEMP required");
		const root = await mkdtemp(join(scratch, "native-hash-"));
		try {
			const buffers = [Buffer.alloc(0), Buffer.from("abc"), Buffer.alloc(5 * 1024 * 1024)];
			for (let i = 0; i < buffers[2].length; i++) buffers[2][i] = i % 251;
			const fixtures = await Promise.all(
				buffers.map(async (buffer, index) => {
					const path = join(root, `inert [${index}] file.bin`);
					await writeFile(path, buffer, { flag: "wx" });
					return { path, sha256: createHash("sha256").update(buffer).digest("hex") };
				}),
			);
			const manifest = join(root, "fixtures.json");
			await writeFile(manifest, JSON.stringify(fixtures), { flag: "wx" });
			const result = spawnSync(
				"powershell.exe",
				[
					"-NoProfile",
					"-NonInteractive",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					fileURLToPath(new URL("./native.hash.test.ps1", import.meta.url)),
					"-NativeScript",
					fileURLToPath(new URL("./native.ps1", import.meta.url)),
					"-FixtureManifest",
					manifest,
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
			expect(result.stdout).toContain("PASS cmdlet-unavailable process hash seam");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
	45000,
);
