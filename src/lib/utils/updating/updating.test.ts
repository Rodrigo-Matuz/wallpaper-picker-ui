import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import * as updating from "./updating";

describe("application updater adapter", () => {
	test("uses one lazy app-wide controller instead of the legacy install helper", async () => {
		expect(updating).not.toHaveProperty("installUpdate");
		expect(updating).toHaveProperty("updaterController");
		const again = await import("./updating");
		expect(again.updaterController).toBe(updating.updaterController);
		expect(get(updating.updaterController.state).status).toBe("idle");
		expect(await updating.updaterController.checkForUpdates()).toBe("completed");
		expect(get(updating.updaterController.state)).toMatchObject({
			status: "manual-only",
			support: { mode: "development", target: null, reason: "browser-runtime" },
			lastCheckedAt: null,
			canDownload: false,
			canInstall: false,
		});
	});
});
