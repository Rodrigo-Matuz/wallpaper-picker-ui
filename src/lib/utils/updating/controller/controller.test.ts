import { describe, expect, mock, test } from "bun:test";
import { Update } from "@tauri-apps/plugin-updater";
import { get } from "svelte/store";
import type { NativeUpdateResource, UpdateSupport } from "$types/updateTypes";
import * as updating from "./controller";

const eligibleSupport = {
	mode: "self-managed",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: "windows-x86_64-nsis",
	reason: "supported",
} as const satisfies UpdateSupport;

function setup(
	options: {
		detectSupport?: () => Promise<unknown>;
		check?: () => Promise<NativeUpdateResource | null>;
	} = {},
) {
	const detectSupport = mock(options.detectSupport ?? (async () => ({ ...eligibleSupport })));
	const check = mock(options.check ?? (async () => null));
	const reportError = mock(async (_details: { phase: string; error: Error }) => {});
	const controller = updating.createUpdaterController({
		currentVersion: "3.5.0",
		detectSupport,
		check,
		now: () => 1234,
		reportError,
	});
	return { controller, detectSupport, check, reportError };
}

function resource() {
	return {
		currentVersion: "3.5.0",
		version: "3.6.0",
		body: "<b>Remote notes</b>",
		date: "2026-10-02",
		rid: 7,
		rawJson: { private: "native manifest" },
		close: mock(async () => {}),
		download: mock(async () => {}),
		install: mock(async () => {}),
	};
}

function nativeResource(body: unknown, date: unknown) {
	// Rust 2.9.0 metadata is nullable despite the installed JS constructor's declarations.
	const update: NativeUpdateResource = new Update({
		currentVersion: "3.5.0",
		version: "3.6.0",
		body,
		date,
		rid: 7,
		rawJson: { private: "native manifest" },
	} as ConstructorParameters<typeof Update>[0]);
	// Replace only this instance's cleanup so these tests cannot invoke native IPC.
	return Object.assign(update, { close: mock(async () => {}) });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("isolated updater controller", () => {
	test("a support-detection failure retries detection without calling the feed", async () => {
		const { controller, detectSupport, check } = setup();
		detectSupport.mockRejectedValueOnce("IPC unavailable");
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(get(controller.state).failure).toEqual({
			phase: "support",
			category: "support-unavailable",
		});
		expect(check).not.toHaveBeenCalled();
		expect(await controller.retry()).toBe("completed");
		expect(detectSupport).toHaveBeenCalledTimes(2);
		expect(check).toHaveBeenCalledTimes(1);
	});
	test("failed cleanup is quarantined and retried before another native check", async () => {
		const update = resource();
		const { controller, check, detectSupport } = setup();
		check.mockResolvedValueOnce(update);
		await controller.checkForUpdates();
		update.close.mockRejectedValueOnce("resource cleanup failed");
		expect(await controller.dismissAvailableUpdate()).toBe("failed");
		expect(get(controller.state)).toMatchObject({
			failure: { phase: "cleanup", category: "cleanup-failed" },
			availableUpdate: null,
			canRetry: true,
		});
		expect(detectSupport).toHaveBeenCalledTimes(1);
		expect(await controller.retry()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(2);
		expect(check).toHaveBeenCalledTimes(2);
	});
	test("cannot dismiss a resource returned by an active check", async () => {
		const wait = deferred<NativeUpdateResource>();
		const started = deferred<void>();
		const update = resource();
		const { controller } = setup({
			check: () => {
				started.resolve();
				return wait.promise;
			},
		});
		const checking = controller.checkForUpdates();
		await started.promise;
		expect(await controller.dismissAvailableUpdate()).toBe("busy");
		expect(update.close).not.toHaveBeenCalled();
		wait.resolve(update);
		expect(await checking).toBe("completed");
		expect(get(controller.state).status).toBe("available");
		expect(update.close).not.toHaveBeenCalled();
		await controller.dismissAvailableUpdate();
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("diagnostic logging failure does not change operation recovery", async () => {
		const { controller, check, reportError } = setup();
		reportError.mockRejectedValueOnce(new Error("logger unavailable"));
		check.mockRejectedValueOnce(new Error("network offline"));
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(get(controller.state).failure).toEqual({ phase: "check", category: "network" });
		expect(await controller.retry()).toBe("completed");
	});
	test("support snapshots are frozen copies rather than shared input objects", async () => {
		const original = { ...eligibleSupport };
		const { controller } = setup({ detectSupport: async () => original });
		await controller.checkForUpdates();
		Object.defineProperty(original, "mode", { value: "package-managed" });
		const snapshot = get(controller.state);
		expect(snapshot.support?.mode).toBe("self-managed");
		expect(Object.isFrozen(snapshot.support)).toBe(true);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(await controller.retry()).toBe("not-available");
	});
	test.each([
		["windows", "msi", "windows-x86_64-msi"],
		["linux", "appimage", "linux-x86_64-appimage"],
	])("preserves the approved %s/%s target", async (platform, installer, target) => {
		const { controller, check } = setup({
			detectSupport: async () => ({ ...eligibleSupport, platform, installer, target }),
		});
		await controller.checkForUpdates();
		expect(check).toHaveBeenCalledWith({ target, timeout: 15000, allowDowngrades: false });
	});
	test.each([
		["null body", null, "2026-10-02", undefined, "2026-10-02"],
		["null date", "<b>Remote notes</b>", null, "<b>Remote notes</b>", undefined],
		["null body and date", null, null, undefined, undefined],
		["undefined body and date", undefined, undefined, undefined, undefined],
		["empty string body and date", "", "", "", ""],
	] as const)("publishes available metadata from the installed Update with %s", async (_label, body, date, expectedBody, expectedDate) => {
		const update = nativeResource(body, date);
		expect(update).toBeInstanceOf(Update);
		expect(update.body).toBe(body);
		expect(update.date).toBe(date);
		const { controller, reportError } = setup({ check: async () => update });
		const result = await controller.checkForUpdates();
		const snapshot = get(controller.state);
		expect(snapshot).toMatchObject({
			status: "available",
			failure: null,
			availableUpdate: {
				currentVersion: "3.5.0",
				version: "3.6.0",
				body: expectedBody,
				date: expectedDate,
			},
			canDownload: true,
			canInstall: false,
		});
		expect(result).toBe("completed");
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.availableUpdate)).toBe(true);
		expect(snapshot.availableUpdate).not.toHaveProperty("rid");
		expect(snapshot.availableUpdate).not.toHaveProperty("rawJson");
		expect(snapshot.availableUpdate).not.toHaveProperty("close");
		expect(update.body).toBe(body);
		expect(update.date).toBe(date);
		expect(update.close).not.toHaveBeenCalled();
		expect(reportError).not.toHaveBeenCalled();
		expect(await controller.dismissAvailableUpdate()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test.each([
		["body", 42],
		["body", false],
		["body", {}],
		["body", []],
		["date", 42],
		["date", false],
		["date", {}],
		["date", []],
	] as const)("rejects non-string native %s metadata (%j)", async (field, value) => {
		const update = nativeResource(
			field === "body" ? value : null,
			field === "date" ? value : null,
		);
		const { controller } = setup({ check: async () => update });
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(get(controller.state)).toMatchObject({
			status: "error",
			availableUpdate: null,
			failure: { phase: "check", category: "invalid-manifest" },
		});
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("rejects malformed metadata and releases its resource", async () => {
		const update = resource();
		Object.defineProperty(update, "version", { value: null });
		const { controller } = setup({ check: async () => update });
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			availableUpdate: null,
			failure: { phase: "check", category: "invalid-manifest" },
		});
	});
	test("closes a failed check resource before the operation settles", async () => {
		const update = resource();
		Object.defineProperty(update, "version", {
			get: () => {
				throw new Error("malformed manifest metadata");
			},
		});
		const { controller } = setup({ check: async () => update });
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			failure: { phase: "check", category: "invalid-manifest" },
			canRetry: true,
		});
	});
	test("normalizes rejections whose string conversion throws", async () => {
		const { controller, check, reportError } = setup();
		check.mockRejectedValueOnce(Object.create(null));
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(get(controller.state).failure).toEqual({ phase: "check", category: "unknown" });
		expect(reportError.mock.calls[0]?.[0].error).toBeInstanceOf(Error);
		expect(await controller.retry()).toBe("completed");
	});
	test("joins dismissals and blocks other operations until close completes", async () => {
		const update = resource();
		const closing = deferred<void>();
		const started = deferred<void>();
		update.close.mockImplementation(() => {
			started.resolve();
			return closing.promise;
		});
		const { controller, check } = setup({ check: async () => update });
		await controller.checkForUpdates();
		expect(typeof controller.dismissAvailableUpdate).toBe("function");
		const first = controller.dismissAvailableUpdate();
		expect(controller.dismissAvailableUpdate()).toBe(first);
		await started.promise;
		expect(await controller.checkForUpdates()).toBe("busy");
		expect(await controller.retry()).toBe("busy");
		expect(get(controller.state)).toMatchObject({ busy: "dismiss", canCheck: false });
		closing.resolve();
		expect(await first).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "idle",
			availableUpdate: null,
			canCheck: true,
		});
		expect(await controller.dismissAvailableUpdate()).toBe("not-available");
	});
	test("awaits resource cleanup before rechecking the native policy", async () => {
		const update = resource();
		const closing = deferred<void>();
		update.close.mockImplementation(() => closing.promise);
		const { controller, check, detectSupport } = setup();
		check.mockResolvedValueOnce(update);
		await controller.checkForUpdates();
		const recheck = controller.checkForUpdates();
		expect(get(controller.state).availableUpdate).toBeNull();
		await Promise.resolve();
		await Promise.resolve();
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(detectSupport).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledTimes(1);
		closing.resolve();
		expect(await recheck).toBe("completed");
		expect(check).toHaveBeenCalledTimes(2);
		expect(get(controller.state).status).toBe("up-to-date");
	});
	test("publishes frozen metadata without exposing a native resource", async () => {
		const update = resource();
		const { controller } = setup({ check: async () => update });
		expect(await controller.checkForUpdates()).toBe("completed");
		const snapshot = get(controller.state);
		expect(snapshot.status).toBe("available");
		expect(snapshot.availableUpdate).toEqual({
			currentVersion: "3.5.0",
			version: "3.6.0",
			body: "<b>Remote notes</b>",
			date: "2026-10-02",
		});
		expect(Object.isFrozen(snapshot.availableUpdate)).toBe(true);
		expect(snapshot.availableUpdate).not.toHaveProperty("rid");
		expect(snapshot.availableUpdate).not.toHaveProperty("rawJson");
		expect(snapshot.availableUpdate).not.toHaveProperty("close");
		expect(controller.state).not.toHaveProperty("set");
		expect(update.close).not.toHaveBeenCalled();
		expect(update.download).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
	});
	test.each([
		["connection error: DNS lookup failed", "network"],
		["HTTP 404 Not Found", "missing-feed"],
		["Could not fetch a valid release JSON from the remote", "invalid-manifest"],
		[
			"the platform `windows-x86_64-nsis` was not found on the response `platforms` object",
			"missing-target",
		],
		["unrecognized backend failure", "unknown"],
	] as const)("categorizes check diagnostics without exposing raw text: %s", async (diagnostic, category) => {
		const { controller, check } = setup();
		check.mockRejectedValueOnce(diagnostic);
		expect(await controller.checkForUpdates()).toBe("failed");
		const snapshot = get(controller.state);
		expect(snapshot.failure).toEqual({ phase: "check", category });
		expect(snapshot.canRetry).toBe(true);
		expect(JSON.stringify(snapshot)).not.toContain(diagnostic);
	});
	test.each([
		"package-managed",
		"self-managed",
	])("hard-excludes Nix even with a misleading %s mode", async (mode) => {
		const { controller, check } = setup({
			detectSupport: async () => ({
				...eligibleSupport,
				mode,
				platform: "linux",
				installer: "nix",
				target: "linux-x86_64-appimage",
				reason: "supported",
			}),
		});
		expect(await controller.checkForUpdates()).toBe("completed");
		expect(check).not.toHaveBeenCalled();
		expect(get(controller.state)).toMatchObject({
			status: "manual-only",
			canCheck: false,
			canDownload: false,
			canInstall: false,
			lastCheckedAt: null,
		});
	});
	test("retains a typed check failure and explicitly retries it", async () => {
		const { controller, check, reportError } = setup();
		check.mockRejectedValueOnce("request timed out");
		expect(await controller.checkForUpdates()).toBe("failed");
		expect(get(controller.state)).toMatchObject({
			status: "error",
			failure: { phase: "check", category: "timeout" },
			lastCheckedAt: null,
			canRetry: true,
			canInstall: false,
		});
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError.mock.calls[0]?.[0].error).toBeInstanceOf(Error);
		expect(typeof controller.retry).toBe("function");
		expect(await controller.retry()).toBe("completed");
		expect(check).toHaveBeenCalledTimes(2);
		expect(get(controller.state)).toMatchObject({
			status: "up-to-date",
			failure: null,
			canRetry: false,
		});
	});
	test.each([
		null,
		{},
		{ ...eligibleSupport, target: null },
		{ ...eligibleSupport, target: "windows-x86_64" },
		{ ...eligibleSupport, installer: "msi" },
		{ ...eligibleSupport, platform: "linux" },
		{ ...eligibleSupport, architecture: "aarch64" },
		{ ...eligibleSupport, reason: "native-validation-pending" },
		{ ...eligibleSupport, reason: 42 },
	])("fails closed for unapproved or inconsistent native support %#", async (support) => {
		const { controller, check } = setup({ detectSupport: async () => support });
		expect(await controller.checkForUpdates()).toBe("completed");
		expect(get(controller.state).status).toBe("manual-only");
		expect(check).not.toHaveBeenCalled();
	});
	test.each([
		"development",
		"package-managed",
		"manual-only",
		"unknown",
	])("does not check the updater feed for %s installations", async (mode) => {
		const { controller, check } = setup({
			detectSupport: async () => ({ ...eligibleSupport, mode }),
		});
		expect(await controller.checkForUpdates()).toBe("completed");
		expect(get(controller.state)).toMatchObject({
			status: "manual-only",
			lastCheckedAt: null,
			canDownload: false,
			canInstall: false,
		});
		expect(check).not.toHaveBeenCalled();
	});
	test("joins concurrent and synchronous subscriber reentrant checks", async () => {
		const wait = deferred<null>();
		const started = deferred<void>();
		const { controller, check, detectSupport } = setup({
			check: () => {
				started.resolve();
				return wait.promise;
			},
		});
		let reentered = false;
		let subscriberResult: ReturnType<typeof controller.checkForUpdates> | undefined;
		const unsubscribe = controller.state.subscribe((snapshot) => {
			if (snapshot.status === "checking" && !reentered) {
				reentered = true;
				subscriberResult = controller.checkForUpdates();
			}
		});
		const first = controller.checkForUpdates();
		expect(controller.checkForUpdates()).toBe(first);
		expect(subscriberResult).toBe(first);
		await started.promise;
		expect(detectSupport).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledTimes(1);
		wait.resolve(null);
		expect(await first).toBe("completed");
		unsubscribe();
		await controller.checkForUpdates();
		expect(check).toHaveBeenCalledTimes(2);
	});
	test("reactively checks an exact target without allowing downgrades", async () => {
		const { controller, check } = setup();
		expect(typeof controller.checkForUpdates).toBe("function");
		const statuses: string[] = [];
		const unsubscribe = controller.state.subscribe((snapshot) =>
			statuses.push(snapshot.status),
		);
		const result = controller.checkForUpdates();
		expect(get(controller.state)).toMatchObject({ status: "checking", canCheck: false });
		expect(await result).toBe("completed");
		expect(check).toHaveBeenCalledWith({
			target: "windows-x86_64-nsis",
			timeout: 15000,
			allowDowngrades: false,
		});
		expect(get(controller.state)).toMatchObject({
			status: "up-to-date",
			lastCheckedAt: 1234,
			canCheck: true,
			busy: null,
		});
		expect(statuses).toContain("checking");
		expect(statuses.at(-1)).toBe("up-to-date");
		unsubscribe();
	});
	test("starts idle without making a native call", () => {
		expect(typeof updating.createUpdaterController).toBe("function");
		const detectSupport = mock(async () => null);
		const check = mock(async () => null);
		const controller = updating.createUpdaterController({
			currentVersion: "3.5.0",
			detectSupport,
			check,
		});
		expect(get(controller.state)).toMatchObject({
			status: "idle",
			currentVersion: "3.5.0",
			availableUpdate: null,
			failure: null,
			lastCheckedAt: null,
			canCheck: true,
			canDownload: false,
			canInstall: false,
		});
		expect(detectSupport).not.toHaveBeenCalled();
		expect(check).not.toHaveBeenCalled();
	});
});
