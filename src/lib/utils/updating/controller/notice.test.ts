import { describe, expect, mock, test } from "bun:test";
import { get } from "svelte/store";
import type { AvailableUpdate, NativeUpdateResource, UpdateSupport } from "$types/updateTypes";
import { createUpdaterController } from "./controller";

const managed: UpdateSupport = {
	mode: "package-managed",
	platform: "linux",
	architecture: "x86_64",
	installer: "deb",
	target: null,
	checkTarget: null,
	reason: "package-managed",
};
const metadata = {
	currentVersion: "3.6.9",
	version: "3.7.0",
	body: "Notes",
	date: "2026-10-14T00:00:00Z",
};

function fixture(policy: unknown = managed) {
	const detectSupport = mock(async (): Promise<unknown> => policy);
	const check = mock(async (): Promise<NativeUpdateResource | null> => null);
	const checkReleaseNotice = mock(async (): Promise<AvailableUpdate | null> => metadata);
	const prepareInstall = mock(async () => ({ release() {} }));
	const relaunch = mock(async () => {});
	const reportError = mock(async () => {});
	const controller = createUpdaterController({
		currentVersion: "3.6.9",
		detectSupport,
		check,
		checkReleaseNotice,
		prepareInstall,
		relaunch,
		reportError,
		now: () => 1234,
	});
	return {
		controller,
		detectSupport,
		check,
		checkReleaseNotice,
		prepareInstall,
		relaunch,
		reportError,
	};
}

describe("resource-free Linux release notices", () => {
	test.each([
		managed,
		{ ...managed, installer: "rpm" },
		{ ...managed, installer: "nix", reason: "nix-managed" },
		{ ...managed, checkTarget: undefined },
		{
			...managed,
			mode: "manual-only",
			installer: "appimage",
			checkTarget: "linux-x86_64-appimage",
			reason: "native-validation-pending",
		},
		{
			...managed,
			mode: "manual-only",
			installer: "appimage",
			checkTarget: "linux-x86_64-appimage",
			reason: "app-image-read-only",
		},
	])("publishes notice-only availability without creating updater resources: %j", async (policy) => {
		// Absent checkTarget is legacy package provenance; explicit undefined is invalid wire data.
		const input = { ...policy };
		if (input.checkTarget === undefined) delete input.checkTarget;
		const f = fixture(input);
		expect(get(f.controller.state).releaseNoticeOnly).toBe(false);
		expect(await f.controller.checkForUpdates()).toBe("completed");
		expect(f.checkReleaseNotice).toHaveBeenCalledWith();
		expect(f.check).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			availableUpdate: metadata,
			releaseNoticeOnly: true,
			lastCheckedAt: 1234,
			canCheck: true,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		expect(Object.isFrozen(get(f.controller.state).availableUpdate)).toBe(true);
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(
			await f.controller.installAndRestart({ confirmed: true, version: metadata.version }),
		).toBe("not-available");
		expect(
			await f.controller.updateAndRestart({ confirmed: true, version: metadata.version }),
		).toBe("not-available");
		expect(await f.controller.dismissAvailableUpdate()).toBe("not-available");
		expect(f.prepareInstall).not.toHaveBeenCalled();
		expect(f.relaunch).not.toHaveBeenCalled();
	});

	test.each([
		{ ...metadata, version: "3.6.9" },
		{ ...metadata, version: "3.6.8" },
		{ ...metadata, version: "3.6.9+new.build" },
		{ ...metadata, version: "3.8.0-beta.1" },
		null,
	])("does not alert for non-newer or unstable notice metadata: %j", async (notice) => {
		const f = fixture();
		f.checkReleaseNotice.mockResolvedValue(notice);
		expect(await f.controller.checkForUpdates()).toBe("completed");
		expect(get(f.controller.state)).toMatchObject({
			status: "up-to-date",
			availableUpdate: null,
			releaseNoticeOnly: true,
			lastCheckedAt: 1234,
			canCheck: true,
		});
		expect(f.check).not.toHaveBeenCalled();
	});

	test.each([
		undefined,
		false,
		42,
		[],
		{},
		{ ...metadata, currentVersion: "3.6.8" },
		{ ...metadata, currentVersion: 42 },
		{ ...metadata, version: "not-semver" },
		{ ...metadata, version: "v3.7.0" },
		{ ...metadata, version: "03.7.0" },
		{ ...metadata, version: "3.7.0-beta.01" },
		{ ...metadata, version: "3.7.0+" },
		{ ...metadata, version: `3.7.0${"0".repeat(300)}` },
		{ ...metadata, body: 42 },
		{ ...metadata, date: 42 },
		{ ...metadata, date: "" },
		{ ...metadata, date: "invalid" },
		{ ...metadata, date: "2026-02-30T00:00:00Z" },
		{ ...metadata, date: "2026-10-14T25:00:00Z" },
	])("fails closed on malformed notice metadata and permits explicit retry: %j", async (notice) => {
		const f = fixture();
		f.checkReleaseNotice.mockResolvedValueOnce(notice as AvailableUpdate);
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(get(f.controller.state)).toMatchObject({
			status: "error",
			availableUpdate: null,
			releaseNoticeOnly: false,
			lastCheckedAt: null,
			canRetry: true,
			failure: { phase: "check", category: "invalid-manifest" },
		});
		expect(await f.controller.retry()).toBe("completed");
		expect(get(f.controller.state).availableUpdate?.version).toBe("3.7.0");
		expect(f.check).not.toHaveBeenCalled();
	});

	test.each([
		{ ...managed, installer: "rpm" },
		{ ...managed, installer: "nix", reason: "nix-managed" },
		{ ...managed, checkTarget: "linux-x86_64-appimage" },
		{ ...managed, architecture: "aarch64" },
		{ ...managed, mode: "development" },
		{ ...managed, reason: "unsupported" },
		{ ...managed, checkTarget: undefined },
	])("revokes metadata when exact notice provenance changes: %j", async (changed) => {
		const f = fixture();
		const input = { ...changed };
		if (input.checkTarget === undefined) delete input.checkTarget;
		f.detectSupport.mockResolvedValueOnce(managed).mockResolvedValueOnce(input);
		expect(await f.controller.checkForUpdates()).toBe("not-available");
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(get(f.controller.state)).toMatchObject({
			status: "manual-only",
			availableUpdate: null,
			releaseNoticeOnly: false,
			lastCheckedAt: null,
		});
		expect(f.check).not.toHaveBeenCalled();
	});

	test("holds the shared check lock through null-result provenance refresh and clears the notice marker at check entry", async () => {
		const f = fixture();
		await f.controller.checkForUpdates();
		const refreshing = Promise.withResolvers<unknown>();
		const started = Promise.withResolvers<void>();
		f.checkReleaseNotice.mockResolvedValue(null);
		f.detectSupport.mockResolvedValueOnce(managed).mockImplementationOnce(() => {
			started.resolve();
			return refreshing.promise;
		});
		let reentered: Promise<unknown> | undefined;
		let dismissing: Promise<unknown> | undefined;
		let updating: Promise<unknown> | undefined;
		const unsubscribe = f.controller.state.subscribe((state) => {
			if (state.status === "checking") {
				expect(state.releaseNoticeOnly).toBe(false);
				expect(state.availableUpdate).toBeNull();
				reentered = f.controller.checkForUpdates();
				dismissing = f.controller.dismissAvailableUpdate();
				updating = f.controller.updateAndRestart({
					confirmed: true,
					version: metadata.version,
				});
			}
		});
		const checking = f.controller.checkForUpdates();
		try {
			await started.promise;
			expect(reentered).toBe(checking);
			expect(await dismissing).toBe("busy");
			expect(await updating).toBe("busy");
			expect(get(f.controller.state).busy).toBe("check");
		} finally {
			unsubscribe();
			refreshing.resolve(managed);
			await checking;
		}
		expect(get(f.controller.state)).toMatchObject({
			status: "up-to-date",
			releaseNoticeOnly: true,
		});
	});

	test("a failed notice provenance refresh exposes no metadata and retries explicitly", async () => {
		const f = fixture();
		f.detectSupport
			.mockResolvedValueOnce(managed)
			.mockRejectedValueOnce(new Error("IPC failed"));
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(get(f.controller.state)).toMatchObject({
			failure: { phase: "support", category: "support-unavailable" },
			availableUpdate: null,
			releaseNoticeOnly: false,
			canRetry: true,
		});
		expect(await f.controller.retry()).toBe("completed");
		expect(f.check).not.toHaveBeenCalled();
	});

	test.each([
		{ ...managed, mode: "unknown" },
		{ ...managed, mode: "development" },
		{ ...managed, platform: "windows" },
		{ ...managed, architecture: "aarch64" },
		{ ...managed, installer: null },
		{ ...managed, reason: "nix-managed" },
		{ ...managed, installer: "nix", reason: "package-managed" },
		{ ...managed, target: "linux-x86_64-appimage" },
		{ ...managed, checkTarget: "linux-x86_64-appimage" },
		{ ...managed, checkTarget: "windows-x86_64-nsis" },
		{ ...managed, checkTarget: undefined },
	])("denies contradictory managed provenance without aliasing to SDK targets: %j", async (policy) => {
		const f = fixture(policy);
		expect(await f.controller.checkForUpdates()).toBe("completed");
		expect(f.checkReleaseNotice).not.toHaveBeenCalled();
		expect(f.check).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			status: "manual-only",
			availableUpdate: null,
			releaseNoticeOnly: false,
		});
	});

	test.each([
		managed,
		{ ...managed, installer: "rpm" },
		{ ...managed, installer: "nix", reason: "nix-managed" },
	])("missing notice adapter leaves managed policy denied: %j", async (policy) => {
		const check = mock(async () => null);
		const controller = createUpdaterController({
			currentVersion: "3.6.9",
			detectSupport: async () => policy,
			check,
		});
		expect(await controller.checkForUpdates()).toBe("completed");
		expect(get(controller.state)).toMatchObject({
			status: "manual-only",
			releaseNoticeOnly: false,
		});
		expect(check).not.toHaveBeenCalled();
	});

	test("leaves approved Windows SDK checks and installation authority unchanged", async () => {
		const policy = {
			...managed,
			mode: "self-managed",
			platform: "windows",
			installer: "nsis",
			target: "windows-x86_64-nsis",
			checkTarget: "windows-x86_64-nsis",
			reason: "supported",
		};
		const f = fixture(policy);
		const resource = {
			...metadata,
			close: mock(async () => {}),
			download: mock(async () => {}),
			install: mock(async () => {}),
		};
		f.check.mockResolvedValue(resource);
		expect(await f.controller.checkForUpdates()).toBe("completed");
		expect(f.checkReleaseNotice).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			releaseNoticeOnly: false,
			canUpdate: true,
		});
		expect(
			await f.controller.updateAndRestart({ confirmed: true, version: metadata.version }),
		).toBe("completed");
		expect(resource.download).toHaveBeenCalledTimes(1);
		expect(resource.install).toHaveBeenCalledTimes(1);
		expect(f.prepareInstall).toHaveBeenCalledTimes(1);
		expect(f.relaunch).not.toHaveBeenCalled();
		expect(resource.close).not.toHaveBeenCalled();
	});

	test("preserves previous SDK cleanup quarantine before any notice or support request", async () => {
		const policy = {
			...managed,
			mode: "manual-only",
			platform: "windows",
			installer: "nsis",
			checkTarget: "windows-x86_64-nsis",
			reason: "native-validation-pending",
		};
		const f = fixture(policy);
		const resource = { ...metadata, close: mock(async () => {}) };
		f.check.mockResolvedValueOnce(resource);
		await f.controller.checkForUpdates();
		resource.close
			.mockRejectedValueOnce(new Error("close failed"))
			.mockRejectedValueOnce(new Error("still failed"));
		expect(await f.controller.dismissAvailableUpdate()).toBe("failed");
		f.detectSupport.mockResolvedValue(managed);
		expect(await f.controller.retry()).toBe("failed");
		expect(resource.close).toHaveBeenCalledTimes(2);
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(f.checkReleaseNotice).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			failure: { phase: "cleanup", category: "cleanup-failed" },
			releaseNoticeOnly: false,
		});
		expect(await f.controller.retry()).toBe("completed");
		expect(resource.close).toHaveBeenCalledTimes(3);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.checkReleaseNotice).toHaveBeenCalledTimes(1);
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			releaseNoticeOnly: true,
		});
	});

	test("offline notice failures are retryable and failing diagnostics do not alter recovery", async () => {
		const f = fixture();
		f.checkReleaseNotice.mockRejectedValueOnce(new Error("network offline"));
		f.reportError.mockRejectedValue(new Error("logger failed"));
		expect(await f.controller.checkForUpdates()).toBe("failed");
		expect(get(f.controller.state)).toMatchObject({
			status: "error",
			releaseNoticeOnly: false,
			availableUpdate: null,
			lastCheckedAt: null,
			canRetry: true,
			failure: { phase: "check", category: "network" },
		});
		expect(await f.controller.retry()).toBe("completed");
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			releaseNoticeOnly: true,
		});
		expect(f.check).not.toHaveBeenCalled();
		expect(f.prepareInstall).not.toHaveBeenCalled();
	});
});
