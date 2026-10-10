import { describe, expect, mock, test } from "bun:test";
import { get } from "svelte/store";
import { createUpdaterController } from "./controller";

const policy = {
	mode: "manual-only",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: null,
	checkTarget: "windows-x86_64-nsis",
	reason: "native-validation-pending",
} as const;

function fixture() {
	const resource = {
		currentVersion: "3.6.1",
		version: "3.7.0",
		body: null,
		date: null,
		close: mock(async () => {}),
		download: mock(async () => {}),
		install: mock(async () => {}),
	};
	const detectSupport = mock(async (): Promise<unknown> => policy);
	const check = mock(async () => resource);
	const prepareInstall = mock(async () => ({ release() {} }));
	const relaunch = mock(async () => {});
	const controller = createUpdaterController({
		currentVersion: "3.6.1",
		detectSupport,
		check,
		prepareInstall,
		relaunch,
	});
	return { controller, resource, detectSupport, check, prepareInstall, relaunch };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe("metadata-only resource ownership", () => {
	test("quarantines failed changed-target disposal and retries cleanup before support or feed work", async () => {
		const f = fixture();
		f.detectSupport.mockResolvedValueOnce(policy).mockResolvedValueOnce({
			...policy,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		f.resource.close.mockRejectedValueOnce(new Error("close failed"));
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(get(f.controller.state)).toMatchObject({
			failure: { phase: "cleanup", category: "cleanup-failed" },
			availableUpdate: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		expect(f.resource.close).toHaveBeenCalledTimes(1);
		const closing = deferred<void>();
		const started = deferred<void>();
		f.resource.close.mockImplementationOnce(() => {
			started.resolve();
			return closing.promise;
		});
		const retry = f.controller.retry();
		try {
			await started.promise;
			expect(f.detectSupport).toHaveBeenCalledTimes(2);
			expect(f.check).toHaveBeenCalledTimes(1);
			expect(await f.controller.downloadUpdate()).toBe("busy");
			expect(await f.controller.dismissAvailableUpdate()).toBe("busy");
		} finally {
			closing.resolve();
			await retry;
		}
		expect(f.resource.close).toHaveBeenCalledTimes(2);
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			canDownload: false,
			canUpdate: false,
		});
		expect(f.resource.download).not.toHaveBeenCalled();
		expect(f.resource.install).not.toHaveBeenCalled();
		expect(f.prepareInstall).not.toHaveBeenCalled();
		expect(f.relaunch).not.toHaveBeenCalled();
	});

	test("awaits provenance under the same reentry lock before publishing candidate metadata", async () => {
		const f = fixture();
		const refreshed = deferred<unknown>();
		const started = deferred<void>();
		f.detectSupport.mockResolvedValueOnce(policy).mockImplementationOnce(() => {
			started.resolve();
			return refreshed.promise;
		});
		const checking = f.controller.checkForUpdates();
		try {
			await started.promise;
			expect(f.controller.checkForUpdates()).toBe(checking);
			expect(get(f.controller.state)).toMatchObject({
				status: "checking",
				busy: "check",
				availableUpdate: null,
			});
			expect(await f.controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
				"busy",
			);
			expect(f.resource.close).not.toHaveBeenCalled();
		} finally {
			refreshed.resolve(policy);
			await checking;
		}
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
	});

	test("a failed provenance refresh releases the acquired resource without exposing metadata", async () => {
		const f = fixture();
		f.detectSupport
			.mockResolvedValueOnce(policy)
			.mockRejectedValueOnce(new Error("IPC failed"));
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(f.resource.close).toHaveBeenCalledTimes(1);
		expect(get(f.controller.state)).toMatchObject({
			failure: { phase: "support", category: "support-unavailable" },
			availableUpdate: null,
			lastCheckedAt: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
	});

	test("malformed acquired metadata is disposed with installation still denied", async () => {
		const f = fixture();
		Object.defineProperty(f.resource, "body", { value: 42 });
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(f.resource.close).toHaveBeenCalledTimes(1);
		expect(get(f.controller.state)).toMatchObject({
			failure: { phase: "check", category: "invalid-manifest" },
			availableUpdate: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
	});

	test("copies the check-only policy and nullable metadata into frozen public data", async () => {
		const f = fixture();
		await f.controller.checkForUpdates();
		const snapshot = get(f.controller.state);
		expect(snapshot.support).not.toBe(policy);
		expect(Object.isFrozen(snapshot.support)).toBe(true);
		expect(Object.isFrozen(snapshot.availableUpdate)).toBe(true);
		expect(snapshot.availableUpdate).toEqual({
			currentVersion: "3.6.1",
			version: "3.7.0",
			body: undefined,
			date: undefined,
		});
		expect(snapshot.availableUpdate).not.toHaveProperty("close");
		expect(await f.controller.dismissAvailableUpdate()).toBe("completed");
		expect(f.resource.close).toHaveBeenCalledTimes(1);
	});
});
