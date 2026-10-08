import { expect, test } from "bun:test";
import * as driver from "./run";

test("entry point refuses the Windows host before reading manifest or spawning Python", async () => {
	expect(typeof driver.run).toBe("function");
	if (driver.run) {
		await expect(
			driver.run(["--case", "writable", "--manifest", "DO-NOT-READ"], {}, "win32", undefined),
		).rejects.toThrow("Linux");
		await expect(
			driver.run(["--case", "readonly", "--manifest", "DO-NOT-READ"], {}, "linux", 1000),
		).rejects.toThrow("guard refused");
	}
});
