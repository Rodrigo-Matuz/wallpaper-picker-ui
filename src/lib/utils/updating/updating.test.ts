import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import * as updating from "./updating";

describe("application updater adapter", () => {
	test("lazily invokes the resource-free release notice command with no arguments only in native runtime", () => {
		const worker = Bun.spawnSync(
			[
				process.execPath,
				"-e",
				`
			import { mock } from "bun:test";
			import { strict as assert } from "node:assert";
			let dependencies;
			let native = false;
			const calls = [];
			const notice = { currentVersion: "3.6.9", version: "3.7.0", body: null, date: null };
			mock.module(${JSON.stringify(`${import.meta.dir}/controller/controller.ts`)}, () => ({
				createUpdaterController: (input) => { dependencies = input; return {}; }
			}));
			mock.module("@tauri-apps/api/core", () => ({
				isTauri: () => native,
				invoke: async (...args) => { calls.push(args); return notice; }
			}));
			mock.module("@tauri-apps/plugin-updater", () => ({
				check: () => { throw new Error("SDK check must not run"); }
			}));
			await import(${JSON.stringify(`${import.meta.dir}/updating.ts`)});
			assert.deepEqual(calls, []);
			assert.equal(typeof dependencies.checkReleaseNotice, "function");
			assert.equal(await dependencies.checkReleaseNotice(), null);
			globalThis.window = {};
			assert.equal(await dependencies.checkReleaseNotice(), null);
			assert.deepEqual(calls, []);
			native = true;
			assert.equal(await dependencies.checkReleaseNotice(), notice);
			assert.deepEqual(calls, [["check_release_notice"]]);
			console.log("release notice wiring verified");
		`,
			],
			{ cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
		);
		const output =
			new TextDecoder().decode(worker.stdout) + new TextDecoder().decode(worker.stderr);
		expect(output).toContain("release notice wiring verified");
		expect(worker.exitCode).toBe(0);
	});
	test("wires prepareInstall to the real application reservation, not an idle snapshot", () => {
		// Capture only the production dependency object in a fresh process, never invoke native IPC.
		const worker = Bun.spawnSync(
			[
				process.execPath,
				"-e",
				`
			import { mock } from "bun:test";
			import { strict as assert } from "node:assert";
			import { applicationWork } from "$utils/applicationWork/applicationWork";
			let dependencies;
			mock.module(${JSON.stringify(`${import.meta.dir}/controller/controller.ts`)}, () => ({
				createUpdaterController: (input) => { dependencies = input; return {}; }
			}));
			await import(${JSON.stringify(`${import.meta.dir}/updating.ts`)});
			assert.equal(typeof dependencies.prepareInstall, "function");
			const work = applicationWork.beginWork();
			assert.equal(await dependencies.prepareInstall(), null);
			work();
			const lease = await dependencies.prepareInstall();
			assert.equal(typeof lease.release, "function");
			assert.throws(() => applicationWork.beginWork(), { name: "InstallationReservedError" });
			lease.release();
			applicationWork.beginWork()();
			console.log("reservation wiring verified");
		`,
			],
			{ cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
		);
		const output =
			new TextDecoder().decode(worker.stdout) + new TextDecoder().decode(worker.stderr);
		expect(output).toContain("reservation wiring verified");
		expect(worker.exitCode).toBe(0);
	});
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
