import { describe, expect, mock, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { mockIPC } from "@tauri-apps/api/mocks";
import { check, Update } from "@tauri-apps/plugin-updater";
import { get } from "svelte/store";
import type { UpdaterCheckOptions } from "$types/updateTypes";
import { createUpdaterController } from "../controller/controller";
import * as updating from "../updating";
import { createNativeUpdateResource } from "./native";

const updateRid = 11;
const bytesRid = 21;
const checkOptions = {
	target: "windows-x86_64-nsis",
	timeout: 15000,
} as const;

const support = {
	mode: "self-managed",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: checkOptions.target,
	reason: "supported",
} as const;

function controllerFixture() {
	const detectSupport = mock(async () => support);
	const checkNative = mock(async (options: UpdaterCheckOptions) => {
		const update = await check(options);
		if (update) expect(update).toBeInstanceOf(Update);
		return update ? createNativeUpdateResource(update) : null;
	});
	const reportError = mock(async (_details: { phase: string; error: Error }) => {});
	const controller = createUpdaterController({
		currentVersion: "3.5.0",
		detectSupport,
		check: checkNative,
		reportError,
	});
	return { controller, detectSupport, checkNative, reportError };
}

function nativeFixture() {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const previousIsTauri = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { crypto: globalThis.crypto },
	});
	Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
	const live = new Set<number>();
	const attempts: number[] = [];
	const failures = new Map<number, unknown[]>();
	const commands: string[] = [];
	const installOptions: unknown[] = [];
	const installFailures: unknown[] = [];
	const logSignals: (() => void)[] = [];
	const reports = [0, 1].map(() => new Promise<void>((resolve) => logSignals.push(resolve)));
	let acquired = false;
	mockIPC((command, payload) => {
		if (
			!payload ||
			Array.isArray(payload) ||
			payload instanceof ArrayBuffer ||
			payload instanceof Uint8Array
		)
			throw new Error("Expected object IPC arguments");
		commands.push(command);
		if (command === "log_message") {
			logSignals.shift()?.();
			return;
		}
		if (command === "get_update_support") return support;
		if (command === "plugin:updater|check") {
			if (acquired) return null;
			acquired = true;
			live.add(updateRid);
			return {
				rid: updateRid,
				currentVersion: "3.5.0",
				version: "3.6.0",
				body: null,
				date: null,
				rawJson: { private: "native manifest" },
			};
		}
		if (command === "plugin:updater|download") {
			expect(payload?.rid).toBe(updateRid);
			expect(live.has(updateRid)).toBe(true);
			live.add(bytesRid);
			return bytesRid;
		}
		if (command === "plugin:updater|install") {
			installOptions.push(payload.restartAfterInstall);
			expect(payload?.updateRid).toBe(updateRid);
			expect(payload?.bytesRid).toBe(bytesRid);
			expect(live.has(updateRid)).toBe(true);
			if (installFailures.length) throw installFailures.shift();
			expect(live.delete(bytesRid)).toBe(true);
			return;
		}
		if (command === "plugin:resources|close") {
			const rid = payload?.rid;
			if (typeof rid !== "number") throw new Error("Missing resource ID");
			attempts.push(rid);
			if (!live.has(rid)) throw new Error(`Invalid resource ID ${rid}`);
			const pendingFailures = failures.get(rid);
			if (pendingFailures?.length) throw pendingFailures.shift();
			live.delete(rid);
			return;
		}
		throw new Error(`Unexpected IPC command ${command}`);
	});
	return {
		live,
		attempts,
		failures,
		commands,
		installOptions,
		installFailures,
		reports,
		async acquire() {
			const update = await check(checkOptions);
			expect(update).toBeInstanceOf(Update);
			if (!update) throw new Error("Expected a mocked SDK Update");
			return update;
		},
		restore() {
			if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
			else Reflect.deleteProperty(globalThis, "window");
			if (previousIsTauri) Object.defineProperty(globalThis, "isTauri", previousIsTauri);
			else Reflect.deleteProperty(globalThis, "isTauri");
		},
	};
}

async function withNativeFixture(run: (native: ReturnType<typeof nativeFixture>) => Promise<void>) {
	const native = nativeFixture();
	try {
		await run(native);
	} finally {
		native.restore();
	}
}

if (process.env.WALLPAPER_PICKER_UPDATER_NATIVE_TESTS === "1") {
	describe("private locked-SDK native resource boundary", () => {
		test("explicitly denies config-level downgrades", async () => {
			const configPath = new URL("../../../../../src-tauri/tauri.conf.json", import.meta.url);
			const config = await Bun.file(fileURLToPath(configPath)).json();
			expect(config.plugins.updater.allowDowngrades).toBe(false);
		});

		test("requests installer restart explicitly through the bound SDK method", async () => {
			await withNativeFixture(async (native) => {
				const resource = createNativeUpdateResource(await native.acquire());
				const download = resource.download;
				const install = resource.install;
				if (!download || !install) throw new Error("Expected bound SDK lifecycle methods");
				await download(() => {}, { timeout: 600000 });
				await install();
				expect(native.installOptions).toEqual([true]);
				await resource.close();
				expect(native.attempts).toEqual([updateRid]);
				expect([...native.live]).toEqual([]);
			});
		});

		test("installer launch rejection retains bytes until confirmed cleanup", async () => {
			await withNativeFixture(async (native) => {
				const failure = new Error("Native installer launch failed");
				native.installFailures.push(failure);
				const resource = createNativeUpdateResource(await native.acquire());
				if (!resource.download || !resource.install)
					throw new Error("Expected bound SDK lifecycle methods");
				await resource.download(() => {}, { timeout: 600000 });
				await expect(resource.install()).rejects.toBe(failure);
				expect(native.installOptions).toEqual([true]);
				expect([...native.live]).toEqual([updateRid, bytesRid]);
				expect(native.attempts).toEqual([]);
				await resource.close();
				await resource.close();
				expect(native.attempts).toEqual([bytesRid, updateRid]);
				expect([...native.live]).toEqual([]);
				expect(native.commands).not.toContain("plugin:updater|download_and_install");
			});
		});

		test("resumes native Update cleanup after bytes are already released", async () => {
			const config = await import("$api/config/read/read");
			const { defaultConfig } = await import("$api/config/defaults");
			const previousConfig = config.peekConfig();
			// Keep production diagnostics entirely in-memory, with all log IPC mocked.
			config.setConfigCache({ ...defaultConfig, debugMode: true });
			try {
				await withNativeFixture(async (native) => {
					native.failures.set(updateRid, [new Error("Update cleanup failed once")]);
					const { updaterController: controller } = updating;
					expect(await controller.checkForUpdates()).toBe("completed");
					expect(await controller.downloadUpdate()).toBe("completed");
					expect(get(controller.state).status).toBe("ready-to-install");
					expect(await controller.dismissAvailableUpdate()).toBe("failed");
					await native.reports[0];
					expect(native.attempts).toEqual([bytesRid, updateRid]);
					expect([...native.live]).toEqual([updateRid]);
					expect(get(controller.state)).toMatchObject({
						status: "error",
						canRetry: true,
						canDownload: false,
						canInstall: false,
						failure: { phase: "cleanup", category: "cleanup-failed" },
					});
					const retrying = controller.retry();
					expect(get(controller.state).status).toBe("checking");
					const result = await retrying;
					if (result === "failed") await native.reports[1];
					expect(native.attempts).toEqual([bytesRid, updateRid, updateRid]);
					expect(result).toBe("completed");
					expect([...native.live]).toEqual([]);
					expect(get(controller.state)).toMatchObject({
						status: "up-to-date",
						failure: null,
					});
					expect(native.commands.slice(-3)).toEqual([
						"plugin:resources|close",
						"get_update_support",
						"plugin:updater|check",
					]);
					expect(
						native.commands.filter((command) => command === "plugin:updater|download"),
					).toHaveLength(1);
				});
			} finally {
				if (previousConfig) config.setConfigCache(previousConfig);
				else config.clearConfigCache();
			}
		});

		test("completed cleanup is idempotent without repeating successful closings", async () => {
			await withNativeFixture(async (native) => {
				const update = await native.acquire();
				const resource = createNativeUpdateResource(update);
				if (!resource.download) throw new Error("Expected a bound SDK download");
				await resource.download(() => {}, { timeout: 600000 });
				expect([...native.live]).toEqual([updateRid, bytesRid]);
				await resource.close();
				expect(native.attempts).toEqual([bytesRid, updateRid]);
				expect([...native.live]).toEqual([]);
				await expect(resource.close()).resolves.toBeUndefined();
				expect(native.attempts).toEqual([bytesRid, updateRid]);
			});
		});

		test.each([
			new Error("Unknown bytes cleanup failure"),
			new Error(`Invalid resource ID ${bytesRid}`),
		])("bytes cleanup rejection retains quarantine: %s", async (failure) => {
			await withNativeFixture(async (native) => {
				const { controller, detectSupport, checkNative, reportError } = controllerFixture();
				native.failures.set(bytesRid, [failure, failure]);
				expect(await controller.checkForUpdates()).toBe("completed");
				expect(await controller.downloadUpdate()).toBe("completed");
				expect(await controller.dismissAvailableUpdate()).toBe("failed");
				expect(native.attempts).toEqual([bytesRid]);
				expect([...native.live]).toEqual([updateRid, bytesRid]);
				expect(get(controller.state)).toMatchObject({
					status: "error",
					availableUpdate: null,
					canRetry: true,
					canDownload: false,
					canInstall: false,
					failure: { phase: "cleanup", category: "cleanup-failed" },
				});
				expect(await controller.retry()).toBe("failed");
				expect(native.attempts).toEqual([bytesRid, bytesRid]);
				expect([...native.live]).toEqual([updateRid, bytesRid]);
				expect(detectSupport).toHaveBeenCalledTimes(2); // Initial check and pre-download policy.
				expect(checkNative).toHaveBeenCalledTimes(1);
				expect(reportError).toHaveBeenCalledTimes(2);
				for (const [report] of reportError.mock.calls) {
					expect(report.phase).toBe("cleanup");
					expect(report.error).toBe(failure);
				}
				expect(await controller.retry()).toBe("completed");
				expect(native.attempts).toEqual([bytesRid, bytesRid, bytesRid, updateRid]);
				expect([...native.live]).toEqual([]);
				expect(detectSupport).toHaveBeenCalledTimes(3);
				expect(checkNative).toHaveBeenCalledTimes(2);
				expect(get(controller.state)).toMatchObject({
					status: "up-to-date",
					failure: null,
				});
				expect(
					native.commands.filter((command) => command === "plugin:updater|download"),
				).toHaveLength(1);
				expect(native.commands).not.toContain("plugin:updater|install");
			});
		});

		test("does not mistake an invalid resource ID for confirmed release", async () => {
			await withNativeFixture(async (native) => {
				const { controller, detectSupport, checkNative } = controllerFixture();
				await controller.checkForUpdates();
				await controller.downloadUpdate();
				// Simulate a native-side removal for which JS never received a successful close.
				native.live.delete(bytesRid);
				expect(await controller.dismissAvailableUpdate()).toBe("failed");
				expect(await controller.retry()).toBe("failed");
				expect(native.attempts).toEqual([bytesRid, bytesRid]);
				expect([...native.live]).toEqual([updateRid]);
				expect(detectSupport).toHaveBeenCalledTimes(2);
				expect(checkNative).toHaveBeenCalledTimes(1);
				expect(get(controller.state)).toMatchObject({
					status: "error",
					canInstall: false,
					canRetry: true,
					failure: { phase: "cleanup", category: "cleanup-failed" },
				});
			});
		});

		test("preserves bound SDK download/install and its successful bytes consumption", async () => {
			await withNativeFixture(async (native) => {
				const resource = createNativeUpdateResource(await native.acquire());
				const download = resource.download;
				const install = resource.install;
				if (!download || !install) throw new Error("Expected bound SDK lifecycle methods");
				await download(() => {}, { timeout: 600000 });
				await install();
				expect([...native.live]).toEqual([updateRid]);
				await resource.close();
				await resource.close();
				expect(native.attempts).toEqual([updateRid]);
				expect([...native.live]).toEqual([]);
			});
		});

		test("preserves truthful nullable metadata without exposing SDK resources", async () => {
			await withNativeFixture(async (native) => {
				const update = await native.acquire();
				const resource = createNativeUpdateResource(update);
				expect(native.commands).toEqual(["plugin:updater|check"]);
				expect(resource).toMatchObject({
					currentVersion: "3.5.0",
					version: "3.6.0",
					body: null,
					date: null,
				});
				expect(Object.isFrozen(resource)).toBe(true);
				for (const field of ["rid", "rawJson", "downloadedBytes", "available"])
					expect(resource).not.toHaveProperty(field);
				await resource.close();
			});
		});

		test("defers malformed metadata access until the controller owns its cleanup", async () => {
			await withNativeFixture(async (native) => {
				const update = await native.acquire();
				Object.defineProperty(update, "version", {
					get() {
						throw new Error("Invalid updater manifest metadata");
					},
				});
				const resource = createNativeUpdateResource(update);
				const controller = createUpdaterController({
					currentVersion: "3.5.0",
					detectSupport: async () => support,
					check: async () => resource,
				});
				expect(await controller.checkForUpdates()).toBe("failed");
				expect(native.attempts).toEqual([updateRid]);
				expect([...native.live]).toEqual([]);
				expect(get(controller.state).failure).toEqual({
					phase: "check",
					category: "invalid-manifest",
				});
			});
		});
	});
} else {
	// Other Bun files replace core.invoke via mock.module. A fresh runner preserves the
	// installed SDK and mocks only IPC, rather than mistaking those module stubs for evidence.
	test("isolated installed-SDK cleanup regressions", async () => {
		const worker = Bun.spawn([process.execPath, "test", fileURLToPath(import.meta.url)], {
			env: { ...process.env, WALLPAPER_PICKER_UPDATER_NATIVE_TESTS: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(worker.stdout).text(),
			new Response(worker.stderr).text(),
			worker.exited,
		]);
		if (exitCode !== 0)
			throw new Error(`SDK cleanup regressions exited ${exitCode}:
${stdout}${stderr}`);
		expect(exitCode).toBe(0);
	});
}
