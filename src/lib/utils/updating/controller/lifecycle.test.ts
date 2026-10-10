import { describe, expect, mock, test } from "bun:test";
import { get } from "svelte/store";
import type { UpdateDownloadEvent as DownloadEvent, UpdaterDependencies } from "$types/updateTypes";
import { createUpdaterController } from "./controller";

const support = {
	mode: "self-managed",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: "windows-x86_64-nsis",
	reason: "supported",
} as const;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function fixture(overrides: Partial<UpdaterDependencies> = {}) {
	const update = {
		currentVersion: "3.5.0",
		version: "3.6.0",
		close: mock(async () => {}),
		download: mock(
			async (_onEvent: (event: DownloadEvent) => void, _options: { timeout: number }) => {},
		),
		install: mock(async () => {}),
	};
	const check = mock(async () => update);
	const detectSupport = mock(async (): Promise<unknown> => ({ ...support }));
	const reportError = mock(async (_details: { phase: string; error: Error }) => {});
	const controller = createUpdaterController({
		currentVersion: "3.5.0",
		detectSupport,
		check,
		reportError,
		...overrides,
	});
	return { controller, update, check, detectSupport, reportError };
}

describe("split updater lifecycle", () => {
	test.each([
		["reservation", false],
		["reservation", true],
		["leased refresh", false],
		["leased refresh", true],
	] as const)("split install rejects resource mutation during %s (cleanup rejects: %s)", async (timing, cleanupRejects) => {
		const release = mock(() => {});
		const prepareInstall = mock(async () => ({ release }));
		const relaunch = mock(async () => {});
		const { controller, update, detectSupport, check } = fixture({ prepareInstall, relaunch });
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		const gate = deferred<void>();
		const started = deferred<void>();
		if (timing === "reservation") {
			prepareInstall.mockImplementationOnce(async () => {
				started.resolve();
				await gate.promise;
				return { release };
			});
		} else {
			detectSupport.mockResolvedValueOnce(support).mockImplementationOnce(async () => {
				started.resolve();
				await gate.promise;
				return support;
			});
		}
		const cleanupReleaseCounts: number[] = [];
		update.close.mockImplementationOnce(async () => {
			cleanupReleaseCounts.push(release.mock.calls.length);
			if (cleanupRejects) throw new Error("resource close failed");
		});
		const failureReleaseCounts: number[] = [];
		const unsubscribe = controller.state.subscribe((state) => {
			if (state.status === "error") failureReleaseCounts.push(release.mock.calls.length);
		});
		const consent = { confirmed: true, version: "3.6.0" };
		const action = controller.installAndRestart(consent);
		try {
			await started.promise;
			update.version = "3.7.0";
			// Changing both objects to agree cannot replace the original confirmed intent.
			consent.version = "3.7.0";
			gate.resolve();
			expect(await action).toBe("failed");
			expect(update.install).not.toHaveBeenCalled();
			expect(relaunch).not.toHaveBeenCalled();
			expect(prepareInstall).toHaveBeenCalledTimes(1);
			expect(release).toHaveBeenCalledTimes(1);
			expect(update.close).toHaveBeenCalledTimes(1);
			expect(cleanupReleaseCounts).toEqual([1]);
			expect(failureReleaseCounts.length).toBeGreaterThan(0);
			expect(failureReleaseCounts.every((count) => count === 1)).toBe(true);
			expect(get(controller.state)).toMatchObject({
				status: "error",
				busy: null,
				availableUpdate: null,
				canInstall: false,
				canRetry: true,
				failure: cleanupRejects
					? { phase: "cleanup", category: "cleanup-failed" }
					: { phase: "install", category: "install-failed" },
			});
			expect(await controller.retry()).toBe("completed");
			expect(update.close).toHaveBeenCalledTimes(cleanupRejects ? 2 : 1);
			expect(check).toHaveBeenCalledTimes(2);
			expect(update.download).toHaveBeenCalledTimes(1);
			expect(update.install).not.toHaveBeenCalled();
		} finally {
			unsubscribe();
			gate.resolve();
			await action;
		}
	});
	test.each([
		"before call",
		"during first refresh",
	])("split install rejects resource version mutation %s before admission", async (timing) => {
		const release = mock(() => {});
		const prepareInstall = mock(async () => ({ release }));
		const relaunch = mock(async () => {});
		const { controller, update, detectSupport } = fixture({ prepareInstall, relaunch });
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		if (timing === "before call") update.version = "3.7.0";
		else {
			detectSupport.mockImplementationOnce(async () => {
				update.version = "3.7.0";
				return support;
			});
		}
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"failed",
		);
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(relaunch).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "error",
			busy: null,
			availableUpdate: null,
			failure: { phase: "support", category: "support-unavailable" },
			canInstall: false,
			canRetry: true,
		});
	});
	test.each([
		["missing", undefined],
		["unconfirmed", { confirmed: false, version: "3.6.0" }],
		["different version", { confirmed: true, version: "3.7.0" }],
	] as const)("active split install rejects %s consent instead of joining", async (_label, invalidConsent) => {
		const release = mock(() => {});
		const prepareInstall = mock(async () => ({ release }));
		const { controller, update } = fixture({ prepareInstall });
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		const gate = deferred<void>();
		const started = deferred<void>();
		update.install.mockImplementation(() => {
			started.resolve();
			return gate.promise;
		});
		const consent = { confirmed: true, version: "3.6.0" };
		let reentrant: ReturnType<typeof controller.installAndRestart> | undefined;
		const unsubscribe = controller.state.subscribe((state) => {
			if (state.status === "installing" && !reentrant)
				reentrant = controller.installAndRestart({ confirmed: true, version: "3.6.0" });
		});
		const action = controller.installAndRestart(consent);
		try {
			const rejected = controller.installAndRestart(invalidConsent);
			expect(rejected).not.toBe(action);
			expect(await rejected).toBe("busy");
			expect(reentrant).toBe(action);
			// The caller's mutable object must not retarget the registered intent.
			consent.version = "3.7.0";
			consent.confirmed = false;
			expect(controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
				action,
			);
			expect(await controller.installAndRestart(consent)).toBe("busy");
			await started.promise;
			expect(controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
				action,
			);
		} finally {
			unsubscribe();
			gate.resolve();
			await action;
		}
		expect(await action).toBe("completed");
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(prepareInstall).toHaveBeenCalledTimes(1);
		expect(update.close).not.toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
	});
	test.each([
		0,
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("invalid internal timeout %s falls back to the bounded default", async (downloadTimeoutMs) => {
		const { controller, update } = fixture({ downloadTimeoutMs });
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(update.download).toHaveBeenCalledWith(expect.any(Function), { timeout: 600000 });
	});
	test.each([
		undefined,
		null,
		0,
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("unknown/nonpositive total %s remains indeterminate", async (contentLength) => {
		const { controller, update } = fixture();
		update.download.mockImplementation(async (send) => {
			send({ event: "Started", data: { contentLength } });
			send({ event: "Progress", data: { chunkLength: 25 } });
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(get(controller.state).progress).toEqual({
			downloadedBytes: 25,
			totalBytes: null,
			percent: null,
		});
	});
	test("bounds progress and ignores malformed chunks without exposing native data", async () => {
		const { controller, update } = fixture();
		update.download.mockImplementation(async (send) => {
			send({ event: "Started", data: { contentLength: 10 } });
			for (const chunkLength of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
				send({ event: "Progress", data: { chunkLength } });
			send({ event: "Progress", data: { chunkLength: 20 } });
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(get(controller.state).progress).toEqual({
			downloadedBytes: 20,
			totalBytes: 10,
			percent: 100,
		});
		expect(get(controller.state)).not.toHaveProperty("rid");
	});
	test("late callbacks from a completed download cannot alter a newer operation", async () => {
		const { controller, update } = fixture();
		const gates = [deferred<void>(), deferred<void>()];
		const starts = [deferred<void>(), deferred<void>()];
		const callbacks: ((event: DownloadEvent) => void)[] = [];
		update.download.mockImplementation((send) => {
			const index = callbacks.length;
			callbacks.push(send);
			starts[index].resolve();
			return gates[index].promise;
		});
		await controller.checkForUpdates();
		const first = controller.downloadUpdate();
		await starts[0].promise;
		gates[0].resolve();
		await first;
		callbacks[0]({ event: "Progress", data: { chunkLength: 90 } });
		expect(get(controller.state).progress?.downloadedBytes).toBe(0);
		await controller.checkForUpdates();
		const second = controller.downloadUpdate();
		await starts[1].promise;
		callbacks[0]({ event: "Progress", data: { chunkLength: 90 } });
		expect(get(controller.state).progress?.downloadedBytes).toBe(0);
		callbacks[1]({ event: "Progress", data: { chunkLength: 5 } });
		expect(get(controller.state).progress?.downloadedBytes).toBe(5);
		gates[1].resolve();
		await second;
	});
	test("synchronous subscribers join download and install promises", async () => {
		const { controller, update } = fixture({ prepareInstall: async () => ({ release() {} }) });
		await controller.checkForUpdates();
		let downloadReentered = false;
		let installReentered = false;
		let downloadResult: ReturnType<typeof controller.downloadUpdate> | undefined;
		let installResult: ReturnType<typeof controller.installAndRestart> | undefined;
		const confirmation = { confirmed: true, version: "3.6.0" };
		const unsubscribe = controller.state.subscribe((snapshot) => {
			if (snapshot.status === "downloading" && !downloadReentered) {
				downloadReentered = true;
				downloadResult = controller.downloadUpdate();
			}
			if (snapshot.status === "installing" && !installReentered) {
				installReentered = true;
				installResult = controller.installAndRestart(confirmation);
			}
		});
		const downloading = controller.downloadUpdate();
		expect(downloadResult).toBe(downloading);
		await downloading;
		const installing = controller.installAndRestart(confirmation);
		expect(installResult).toBe(installing);
		await installing;
		expect(update.download).toHaveBeenCalledTimes(1);
		expect(update.install).toHaveBeenCalledTimes(1);
		unsubscribe();
	});
	test.each([
		"development",
		"package-managed",
		"manual-only",
		"unknown",
	])("%s policy cannot run lifecycle actions directly", async (mode) => {
		const relaunch = mock(async () => {});
		const { controller, update, check } = fixture({
			prepareInstall: async () => ({ release() {} }),
			relaunch,
			detectSupport: async () => ({ ...support, mode }),
		});
		await controller.checkForUpdates();
		expect(await controller.downloadUpdate()).toBe("not-available");
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"not-available",
		);
		expect(check).not.toHaveBeenCalled();
		expect(update.download).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(relaunch).not.toHaveBeenCalled();
	});
	test("an unwired or rejecting safety gate cannot trigger installation", async () => {
		const missing = fixture();
		await missing.controller.checkForUpdates();
		await missing.controller.downloadUpdate();
		expect(get(missing.controller.state).canInstall).toBe(false);
		expect(
			await missing.controller.installAndRestart({ confirmed: true, version: "3.6.0" }),
		).toBe("not-available");
		expect(missing.update.install).not.toHaveBeenCalled();
		const denied = fixture({ prepareInstall: async () => null });
		await denied.controller.checkForUpdates();
		await denied.controller.downloadUpdate();
		expect(
			await denied.controller.installAndRestart({ confirmed: true, version: "3.6.0" }),
		).toBe("not-available");
		expect(denied.update.install).not.toHaveBeenCalled();
		expect(denied.update.close).not.toHaveBeenCalled();
		expect(get(denied.controller.state).status).toBe("ready-to-install");
	});
	test("changed installer identity before installation discards the ready resource", async () => {
		const { controller, update, detectSupport } = fixture({
			prepareInstall: async () => ({ release() {} }),
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		detectSupport.mockResolvedValueOnce({
			...support,
			installer: "msi",
			target: "windows-x86_64-msi",
		});
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"not-available",
		);
		expect(update.install).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({ status: "manual-only", canInstall: false });
	});
	test("installation rejection requires a new check and download, not blind install retry", async () => {
		const relaunch = mock(async () => {});
		const { controller, update, check } = fixture({
			prepareInstall: async () => ({ release() {} }),
			relaunch,
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		update.install.mockRejectedValueOnce("permission denied");
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"failed",
		);
		expect(get(controller.state)).toMatchObject({
			status: "error",
			canInstall: false,
			failure: { phase: "install", category: "install-failed" },
		});
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(await controller.retry()).toBe("completed");
		expect(check).toHaveBeenCalledTimes(2);
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(relaunch).not.toHaveBeenCalled();
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"not-available",
		);
	});
	test("malformed-check cleanup holds the lock and retains quarantine on rejection", async () => {
		const { controller, update } = fixture();
		Object.defineProperty(update, "version", { value: null });
		const closing = deferred<void>();
		const started = deferred<void>();
		update.close.mockImplementationOnce(() => {
			started.resolve();
			return closing.promise;
		});
		let settled = false;
		const checking = controller.checkForUpdates().then((result) => {
			settled = true;
			return result;
		});
		await started.promise;
		expect(settled).toBe(false);
		expect(get(controller.state)).toMatchObject({
			busy: "check",
			canCheck: false,
			canRetry: false,
		});
		expect(await controller.dismissAvailableUpdate()).toBe("busy");
		expect(await controller.downloadUpdate()).toBe("busy");
		closing.reject("resource cleanup failed");
		expect(await checking).toBe("failed");
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state).failure).toEqual({
			phase: "cleanup",
			category: "cleanup-failed",
		});
		Object.defineProperty(update, "version", { value: "3.6.0" });
		expect(await controller.retry()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(2);
	});
	test("uses the configured internal request timeout for downloads", async () => {
		const { controller, update } = fixture({ downloadTimeoutMs: 120000 });
		await controller.checkForUpdates();
		expect(await controller.downloadUpdate()).toBe("completed");
		expect(update.download).toHaveBeenCalledWith(expect.any(Function), { timeout: 120000 });
	});
	test("dismissal disables all lifecycle actions while cleanup is in flight", async () => {
		const { controller, update } = fixture({ prepareInstall: async () => ({ release() {} }) });
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		const closing = deferred<void>();
		const started = deferred<void>();
		update.close.mockImplementation(() => {
			started.resolve();
			return closing.promise;
		});
		const dismissing = controller.dismissAvailableUpdate();
		await started.promise;
		expect(get(controller.state)).toMatchObject({
			busy: "dismiss",
			canCheck: false,
			canDownload: false,
			canInstall: false,
			canRetry: false,
		});
		closing.resolve();
		expect(await dismissing).toBe("completed");
	});
	test("post-install cleanup rejection stays quarantined until explicit restart retry", async () => {
		const relaunch = mock(async () => {});
		const { controller, update, check } = fixture({
			prepareInstall: async () => ({ release() {} }),
			relaunch,
			detectSupport: async () => ({
				...support,
				platform: "linux",
				installer: "appimage",
				target: "linux-x86_64-appimage",
			}),
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		update.close.mockRejectedValueOnce("resource close failed");
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"failed",
		);
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(relaunch).not.toHaveBeenCalled();
		expect(get(controller.state)).toMatchObject({
			status: "restart-required",
			canCheck: false,
			canRetry: true,
			failure: { phase: "cleanup", category: "cleanup-failed" },
		});
		expect(await controller.retry()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(2);
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledTimes(1);
		expect(relaunch).toHaveBeenCalledTimes(1);
	});
	test("Linux restart failure retries restart only, never installs twice", async () => {
		const relaunch = mock(async () => {});
		relaunch.mockRejectedValueOnce("relaunch failed");
		const { controller, update, check } = fixture({
			prepareInstall: async () => ({ release() {} }),
			relaunch,
			detectSupport: async () => ({
				...support,
				platform: "linux",
				installer: "appimage",
				target: "linux-x86_64-appimage",
			}),
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(get(controller.state).canInstall).toBe(true);
		expect(await controller.installAndRestart({ confirmed: true, version: "3.6.0" })).toBe(
			"failed",
		);
		expect(get(controller.state)).toMatchObject({
			status: "restart-required",
			currentVersion: "3.5.0",
			canCheck: false,
			canInstall: false,
			canRetry: true,
			failure: { phase: "restart", category: "restart-failed" },
		});
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(await controller.checkForUpdates()).toBe("not-available");
		expect(await controller.downloadUpdate()).toBe("not-available");
		expect(await controller.dismissAvailableUpdate()).toBe("not-available");
		expect(await controller.retry()).toBe("completed");
		expect(relaunch).toHaveBeenCalledTimes(2);
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "restarting",
			failure: null,
			canRetry: false,
		});
	});
	test("confirmed Windows installation is handoff, never frontend relaunch", async () => {
		const relaunch = mock(async () => {});
		const prepareInstall = mock(async () => ({ release() {} }));
		const { controller, update } = fixture({ prepareInstall, relaunch });
		const installing = deferred<void>();
		const started = deferred<void>();
		update.install.mockImplementation(() => {
			started.resolve();
			return installing.promise;
		});
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(get(controller.state).canInstall).toBe(true);
		expect(await controller.installAndRestart()).toBe("not-available");
		expect(await controller.installAndRestart({ confirmed: false, version: "3.6.0" })).toBe(
			"not-available",
		);
		expect(await controller.installAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		const confirmation = { confirmed: true, version: "3.6.0" };
		const first = controller.installAndRestart(confirmation);
		expect(controller.installAndRestart(confirmation)).toBe(first);
		await started.promise;
		expect(get(controller.state)).toMatchObject({
			status: "installer-handoff",
			busy: "install",
			canCheck: false,
			canInstall: false,
		});
		expect(prepareInstall).toHaveBeenCalledTimes(1);
		expect(await controller.checkForUpdates()).toBe("busy");
		expect(await controller.dismissAvailableUpdate()).toBe("busy");
		expect(update.close).not.toHaveBeenCalled();
		installing.resolve();
		expect(await first).toBe("completed");
		expect(relaunch).not.toHaveBeenCalled();
		expect(get(controller.state)).toMatchObject({
			status: "installer-handoff",
			canCheck: false,
			canDownload: false,
			canInstall: false,
			canRetry: false,
		});
		expect(await controller.checkForUpdates()).toBe("not-available");
	});
	test("redetects support before download and respects revoked eligibility", async () => {
		const { controller, update, detectSupport } = fixture();
		await controller.checkForUpdates();
		detectSupport.mockResolvedValueOnce({
			...support,
			mode: "manual-only",
			target: null,
		});
		expect(await controller.downloadUpdate()).toBe("not-available");
		expect(update.download).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "manual-only",
			canCheck: false,
			canDownload: false,
			canInstall: false,
		});
	});
	test("signature rejection never enables installation and retry reacquires metadata", async () => {
		const { controller, update, check, reportError } = fixture();
		update.download.mockRejectedValueOnce("Signature verification failed");
		await controller.checkForUpdates();
		expect(await controller.downloadUpdate()).toBe("failed");
		expect(get(controller.state)).toMatchObject({
			status: "error",
			canInstall: false,
			canDownload: false,
			canRetry: true,
			failure: { phase: "download", category: "invalid-signature" },
		});
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(update.install).not.toHaveBeenCalled();
		expect(reportError.mock.calls[0]?.[0].error).toBeInstanceOf(Error);
		expect(await controller.retry()).toBe("completed");
		expect(check).toHaveBeenCalledTimes(2);
		expect(get(controller.state).status).toBe("available");
		expect(update.download).toHaveBeenCalledTimes(1);
	});
	test("only an awaited verified download enables readiness, not Finished", async () => {
		const { controller, update } = fixture();
		const downloading = deferred<void>();
		const started = deferred<void>();
		let send!: (event: DownloadEvent) => void;
		update.download.mockImplementation((onEvent) => {
			send = onEvent;
			started.resolve();
			return downloading.promise;
		});
		await controller.checkForUpdates();
		expect(get(controller.state).canDownload).toBe(true);
		const first = controller.downloadUpdate();
		expect(get(controller.state).status).toBe("downloading");
		expect(controller.downloadUpdate()).toBe(first);
		await started.promise;
		expect(update.download).toHaveBeenCalledWith(expect.any(Function), { timeout: 600000 });
		send({ event: "Started", data: { contentLength: 100 } });
		send({ event: "Progress", data: { chunkLength: 25 } });
		expect(get(controller.state).progress).toEqual({
			downloadedBytes: 25,
			totalBytes: 100,
			percent: 25,
		});
		send({ event: "Finished" });
		expect(get(controller.state)).toMatchObject({ status: "downloading", canInstall: false });
		expect(await controller.checkForUpdates()).toBe("busy");
		expect(await controller.dismissAvailableUpdate()).toBe("busy");
		expect(update.close).not.toHaveBeenCalled();
		downloading.resolve();
		expect(await first).toBe("completed");
		expect(get(controller.state)).toMatchObject({
			status: "ready-to-install",
			canDownload: false,
		});
		expect(update.install).not.toHaveBeenCalled();
		expect(Object.isFrozen(get(controller.state).progress)).toBe(true);
	});
});
