import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("CLI fails closed without an environment token and does not echo credential values", () => {
	const child = Bun.spawnSync(
		[process.execPath, fileURLToPath(new URL("./verify.ts", import.meta.url))],
		{
			env: {
				GITHUB_REPOSITORY: "Rodrigo-Matuz/wallpaper-picker-ui",
				GITHUB_REF_NAME: "v9.8.7",
				GITHUB_TOKEN: "",
			},
			stdout: "pipe",
			stderr: "pipe",
			timeout: 5_000,
		},
	);
	expect(child.exitCode).toBe(1);
	expect(child.stderr.toString()).toContain("Release contract verification failed");
	expect(child.stdout.toString()).toBe("");
});
