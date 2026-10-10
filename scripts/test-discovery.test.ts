import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Bun discovery does not honor Git's ignore rules: archived notes can contain runnable tests.
test("logic test discovery is limited to maintained source and scripts, not archived docs", () => {
	const { scripts } = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	);
	expect(scripts.test).toStartWith("bun test --isolate ./src ./scripts ");
	expect(scripts.test).toContain("--path-ignore-patterns='**/*.component.test.ts'");
});
