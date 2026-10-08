import { expect, test } from "bun:test";
import * as guards from "./guards";

const environment = {
	GITHUB_ACTIONS: "true",
	RUNNER_ENVIRONMENT: "github-hosted",
	RUNNER_OS: "Linux",
	WALLPAPER_PICKER_NATIVE_ACCEPTANCE: "1",
	RUNNER_TEMP: "/home/runner/work/_temp",
};

test("native entry refuses host execution before any side effect", () => {
	expect(typeof guards.assertHostedLinux).toBe("function");
	if (guards.assertHostedLinux) {
		expect(() => guards.assertHostedLinux(environment, "win32", 1000)).toThrow();
		for (const key of Object.keys(environment)) {
			expect(() =>
				guards.assertHostedLinux({ ...environment, [key]: "" }, "linux", 1000),
			).toThrow();
		}
		expect(() => guards.assertHostedLinux(environment, "linux", 0)).toThrow();
		for (const RUNNER_TEMP of [
			"/",
			"/runner/../host",
			"relative",
			"//",
			"/./",
			"/runner/.",
			"/runner//tmp",
			"/runner/",
			"/runner/\0tmp",
		]) {
			expect(() =>
				guards.assertHostedLinux({ ...environment, RUNNER_TEMP }, "linux", 1000),
			).toThrow();
		}
		expect(() => guards.assertHostedLinux(environment, "linux", 1000)).not.toThrow();
	}
});
