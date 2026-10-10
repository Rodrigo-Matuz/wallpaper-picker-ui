import { describe, expect, mock, test } from "bun:test";
import { get } from "svelte/store";
import type { UpdateDownloadEvent, UpdaterDependencies } from "$types/updateTypes";
import { createApplicationWorkTracker } from "$utils/applicationWork/applicationWork";
import { createUpdaterController } from "./controller";

const support = {
	mode: "self-managed",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: "windows-x86_64-nsis",
	reason: "supported",
} as const;
const confirmation = { confirmed: true, version: "3.6.0" } as const;
const linuxSupport = {
	...support,
	platform: "linux",
	installer: "appimage",
	target: "linux-x86_64-appimage",
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
	const release = mock(() => {});
	const prepareInstall = mock(async () => ({ release }));
	const update = {
		currentVersion: "3.5.0",
		version: "3.6.0",
		close: mock(async () => {}),
		download: mock(async (_send: (event: UpdateDownloadEvent) => void) => {}),
		install: mock(async () => {}),
	};
	const detectSupport = mock(async (): Promise<unknown> => ({ ...support }));
	const check = mock(async () => update);
	const relaunch = mock(async () => {});
	const controller = createUpdaterController({
		currentVersion: "3.5.0",
		check,
		detectSupport,
		prepareInstall,
		relaunch,
		...overrides,
	});
	return { controller, update, release, prepareInstall, detectSupport, check, relaunch };
}

describe("version-bound update orchestration", () => {
	test("a changed version after reservation releases the lease without installing", async () => {
		const { controller, update, release, prepareInstall } = fixture();
		await controller.checkForUpdates();
		prepareInstall.mockImplementation(async () => {
			update.version = "3.7.0";
			return { release };
		});
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(update.install).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledTimes(1);
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("an install failure releases admission even when payload disposal also rejects", async () => {
		const { controller, update, release } = fixture();
		await controller.checkForUpdates();
		update.install.mockRejectedValueOnce("install failed");
		update.close.mockRejectedValueOnce("close failed");
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(release).toHaveBeenCalledTimes(1);
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "error",
			failure: { phase: "cleanup" },
			canUpdate: false,
		});
		expect(await controller.retry()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(2);
	});
	test("restart-only denial preserves the installed latch until an explicit admitted recovery", async () => {
		const work = createApplicationWorkTracker();
		const { controller, update, relaunch } = fixture({
			detectSupport: async () => linuxSupport,
			prepareInstall: async () => work.tryReserveInstall(),
		});
		relaunch
			.mockRejectedValueOnce("restart failed")
			.mockRejectedValueOnce("restart failed again");
		await controller.checkForUpdates();
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		const releaseWork = work.beginWork();
		try {
			expect(await controller.retry()).toBe("not-available");
			expect(get(controller.state)).toMatchObject({
				status: "restart-required",
				installBlocked: true,
				canRetry: true,
				canUpdate: false,
			});
			expect(relaunch).toHaveBeenCalledTimes(1);
		} finally {
			releaseWork();
		}
		expect(await controller.retry()).toBe("failed");
		expect(get(work.installationReserved)).toBe(false);
		expect(await controller.retry()).toBe("completed");
		expect(get(controller.state).installBlocked).toBe(false);
		expect(update.download).toHaveBeenCalledTimes(1);
		expect(update.install).toHaveBeenCalledTimes(1);
	});
	test("missing install-safety or Linux relaunch adapters deny one-click work", async () => {
		for (const overrides of [
			{ prepareInstall: undefined },
			{ detectSupport: async () => linuxSupport, relaunch: undefined },
		]) {
			const { controller, update } = fixture(overrides);
			await controller.checkForUpdates();
			expect(get(controller.state).canUpdate).toBe(false);
			expect(await controller.updateAndRestart(confirmation)).toBe("not-available");
			expect(update.download).not.toHaveBeenCalled();
			expect(update.install).not.toHaveBeenCalled();
		}
	});
	test("a missing download adapter cannot be mistaken for successful verification", async () => {
		const { controller, update, prepareInstall } = fixture();
		await controller.checkForUpdates();
		Object.defineProperty(update, "download", { value: undefined });
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(update.install).not.toHaveBeenCalled();
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("a resource version changed before the click cannot download under stale displayed consent", async () => {
		const { controller, update, prepareInstall } = fixture();
		await controller.checkForUpdates();
		update.version = "3.7.0";
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(update.download).not.toHaveBeenCalled();
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("work admitted by a verified-readiness subscriber pauses installation until explicit Update retry", async () => {
		const work = createApplicationWorkTracker();
		const { controller, update } = fixture({
			prepareInstall: async () => work.tryReserveInstall(),
		});
		await controller.checkForUpdates();
		let endWork: (() => void) | undefined;
		let rejectedAdmissions = 0;
		const unsubscribe = controller.state.subscribe((state) => {
			if (state.status === "ready-to-install" && !endWork) endWork = work.beginWork();
			if (state.status === "installer-handoff") {
				try {
					work.beginWork();
				} catch {
					rejectedAdmissions++;
				}
			}
		});
		try {
			expect(await controller.updateAndRestart(confirmation)).toBe("not-available");
			expect(get(controller.state).installBlocked).toBe(true);
			expect(update.install).not.toHaveBeenCalled();
			endWork?.();
			expect(update.install).not.toHaveBeenCalled();
			expect(await controller.updateAndRestart(confirmation)).toBe("completed");
			expect(update.download).toHaveBeenCalledTimes(1);
			expect(update.install).toHaveBeenCalledTimes(1);
			expect(rejectedAdmissions).toBeGreaterThan(0);
		} finally {
			unsubscribe();
			endWork?.();
		}
	});
	test("one-click signature rejection never requests an install reservation", async () => {
		const { controller, update, prepareInstall, check } = fixture();
		await controller.checkForUpdates();
		update.download.mockRejectedValueOnce("Signature verification failed");
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(get(controller.state)).toMatchObject({
			canUpdate: false,
			installBlocked: false,
			failure: { phase: "download", category: "invalid-signature" },
		});
		expect(await controller.retry()).toBe("completed");
		expect(check).toHaveBeenCalledTimes(2);
		expect(update.download).toHaveBeenCalledTimes(1);
	});
	test("a revoked policy after verification disposes the payload without acquiring a lease", async () => {
		const { controller, update, detectSupport, prepareInstall } = fixture();
		await controller.checkForUpdates();
		detectSupport
			.mockResolvedValueOnce(support)
			.mockResolvedValueOnce({ ...support, target: null });
		expect(await controller.updateAndRestart(confirmation)).toBe("not-available");
		expect(update.download).toHaveBeenCalledTimes(1);
		expect(update.install).not.toHaveBeenCalled();
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({ status: "manual-only", canUpdate: false });
	});
	test("successful Linux one-click replacement retains admission through cleanup and relaunch", async () => {
		const work = createApplicationWorkTracker();
		const { controller, update, relaunch } = fixture({
			detectSupport: async () => linuxSupport,
			prepareInstall: async () => work.tryReserveInstall(),
		});
		const phases: string[] = [];
		update.install.mockImplementation(async () => {
			expect(get(work.installationReserved)).toBe(true);
			phases.push("install");
		});
		update.close.mockImplementation(async () => {
			expect(get(work.installationReserved)).toBe(true);
			phases.push("cleanup");
		});
		relaunch.mockImplementation(async () => {
			expect(get(work.installationReserved)).toBe(true);
			phases.push("restart");
		});
		await controller.checkForUpdates();
		expect(await controller.updateAndRestart(confirmation)).toBe("completed");
		expect(phases).toEqual(["install", "cleanup", "restart"]);
		expect(await controller.updateAndRestart(confirmation)).toBe("not-available");
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(get(work.installationReserved)).toBe(true);
	});
	test.each([
		"dismiss",
		"check",
	] as const)("%s clears a stale installation-blocked flag", async (action) => {
		const { controller } = fixture({ prepareInstall: async () => null });
		await controller.checkForUpdates();
		await controller.updateAndRestart(confirmation);
		expect(get(controller.state).installBlocked).toBe(true);
		if (action === "dismiss") await controller.dismissAvailableUpdate();
		else await controller.checkForUpdates();
		expect(get(controller.state).installBlocked).toBe(false);
	});
	test("restart-only recovery reacquires admission before quarantined cleanup", async () => {
		const work = createApplicationWorkTracker();
		const { controller, update } = fixture({
			detectSupport: async () => linuxSupport,
			prepareInstall: async () => work.tryReserveInstall(),
		});
		await controller.checkForUpdates();
		update.close.mockRejectedValueOnce("cleanup failed");
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(get(work.installationReserved)).toBe(false);
		const cleanupAdmission: boolean[] = [];
		update.close.mockImplementation(async () => {
			cleanupAdmission.push(get(work.installationReserved));
		});
		expect(await controller.retry()).toBe("completed");
		expect(cleanupAdmission).toEqual([true]);
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(get(work.installationReserved)).toBe(true);
	});
	test.each([
		"update",
		"split",
	] as const)("%s policy changes while acquiring a lease invalidate the intent and release it even if cleanup rejects", async (action) => {
		let policy: unknown = support;
		const release = mock(() => {});
		const { controller, update } = fixture({
			detectSupport: async () => policy,
			prepareInstall: async () => {
				policy = { ...support, installer: "msi", target: "windows-x86_64-msi" };
				return { release };
			},
		});
		await controller.checkForUpdates();
		if (action === "split") await controller.downloadUpdate();
		update.close.mockRejectedValueOnce("cleanup failed");
		expect(
			await (action === "split"
				? controller.installAndRestart(confirmation)
				: controller.updateAndRestart(confirmation)),
		).toBe("failed");
		expect(update.install).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledTimes(1);
		expect(update.close).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({
			status: "error",
			failure: { phase: "cleanup" },
			canUpdate: false,
		});
		expect(await controller.retry()).toBe("completed");
		expect(update.close).toHaveBeenCalledTimes(2);
	});
	test("a version change during download invalidates consent before reservation", async () => {
		const { controller, update, prepareInstall } = fixture();
		await controller.checkForUpdates();
		update.download.mockImplementation(async () => {
			update.version = "3.7.0";
		});
		expect(await controller.updateAndRestart(confirmation)).toBe("failed");
		expect(prepareInstall).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(update.close).toHaveBeenCalledTimes(1);
	});
	test("different-version or unconfirmed calls do not join an active Update intent", async () => {
		const { controller, update } = fixture();
		await controller.checkForUpdates();
		const gate = deferred<void>();
		update.download.mockImplementation(() => gate.promise);
		const action = controller.updateAndRestart(confirmation);
		try {
			const wrongVersion = controller.updateAndRestart({ confirmed: true, version: "3.7.0" });
			expect(wrongVersion).not.toBe(action);
			expect(await wrongVersion).toBe("busy");
			// @ts-expect-error Unconfirmed consent is invalid even at the public type boundary.
			const unconfirmed = controller.updateAndRestart({ confirmed: false, version: "3.6.0" });
			expect(unconfirmed).not.toBe(action);
			expect(await unconfirmed).toBe("busy");
		} finally {
			gate.resolve();
			await action;
		}
	});
	test.each([
		null,
		true,
		false,
		{},
		{ release: 42 },
	] as const)("gate denial (%j) retains verification for an explicit same-version Update retry", async (invalidLease) => {
		const gate = mock(async (): Promise<unknown> => invalidLease);
		const { controller, update, release } = fixture({
			prepareInstall: gate as unknown as NonNullable<UpdaterDependencies["prepareInstall"]>,
		});
		await controller.checkForUpdates();
		expect(await controller.updateAndRestart(confirmation)).toBe("not-available");
		expect(get(controller.state)).toMatchObject({
			status: "ready-to-install",
			busy: null,
			installBlocked: true,
			canUpdate: true,
			canInstall: false,
			canRetry: false,
			availableUpdate: { version: "3.6.0" },
		});
		expect(update.close).not.toHaveBeenCalled();
		expect(update.install).not.toHaveBeenCalled();
		expect(await controller.retry()).toBe("not-available");
		expect(await controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(gate).toHaveBeenCalledTimes(1);
		gate.mockImplementation(async () => ({ release }));
		expect(await controller.updateAndRestart(confirmation)).toBe("completed");
		expect(update.download).toHaveBeenCalledTimes(1);
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(get(controller.state)).toMatchObject({ installBlocked: false, canUpdate: false });
	});
	test("one click joins the exact promise and holds its lock through verification and handoff", async () => {
		const { controller, update, release, prepareInstall, relaunch } = fixture();
		await controller.checkForUpdates();
		const download = deferred<void>();
		const started = deferred<void>();
		const install = deferred<void>();
		const installStarted = deferred<void>();
		update.download.mockImplementation((send) => {
			send({ event: "Finished" });
			started.resolve();
			return download.promise;
		});
		update.install.mockImplementation(() => {
			installStarted.resolve();
			return install.promise;
		});
		const joined: Promise<unknown>[] = [];
		const conflicts: Promise<unknown>[] = [];
		const unsubscribe = controller.state.subscribe((state) => {
			if (!state.busy) return;
			joined.push(controller.updateAndRestart(confirmation));
			conflicts.push(
				controller.checkForUpdates(),
				controller.dismissAvailableUpdate(),
				controller.downloadUpdate(),
				controller.installAndRestart(confirmation),
				controller.retry(),
			);
			expect(state.canUpdate).toBe(false);
		});
		let action: ReturnType<typeof controller.updateAndRestart> | undefined;
		try {
			expect(get(controller.state).canUpdate).toBe(true);
			action = controller.updateAndRestart(confirmation);
			expect(controller.updateAndRestart(confirmation)).toBe(action);
			await started.promise;
			expect(update.install).not.toHaveBeenCalled();
			expect(prepareInstall).not.toHaveBeenCalled();
			expect(get(controller.state)).toMatchObject({ busy: "update", status: "downloading" });
			download.resolve();
			await installStarted.promise;
			expect(joined.every((promise) => promise === action)).toBe(true);
			expect(await Promise.all(conflicts)).toEqual(conflicts.map(() => "busy"));
			expect(get(controller.state)).toMatchObject({
				busy: "update",
				status: "installer-handoff",
			});
			install.resolve();
			expect(await action).toBe("completed");
			expect(update.download).toHaveBeenCalledTimes(1);
			expect(update.install).toHaveBeenCalledTimes(1);
			expect(release).not.toHaveBeenCalled();
			expect(relaunch).not.toHaveBeenCalled();
		} finally {
			unsubscribe();
			download.resolve();
			install.resolve();
			await action;
		}
	});
	test.each([
		["split", "install"],
		["split", "cleanup"],
		["split", "restart"],
		["update", "install"],
		["update", "cleanup"],
		["update", "restart"],
	] as const)("%s releases the lease on %s failure and reacquires for explicit recovery", async (action, phase) => {
		const { controller, update, release, prepareInstall, relaunch, check } = fixture({
			detectSupport: async () => linuxSupport,
		});
		if (phase === "install") update.install.mockRejectedValueOnce("install failed");
		if (phase === "cleanup") update.close.mockRejectedValueOnce("cleanup failed");
		if (phase === "restart") relaunch.mockRejectedValueOnce("restart failed");
		await controller.checkForUpdates();
		if (action === "split") await controller.downloadUpdate();
		expect(
			await (action === "split"
				? controller.installAndRestart(confirmation)
				: controller.updateAndRestart(confirmation)),
		).toBe("failed");
		expect(release).toHaveBeenCalledTimes(1);
		expect(await controller.retry()).toBe("completed");
		if (phase === "install") {
			expect(check).toHaveBeenCalledTimes(2);
			expect(prepareInstall).toHaveBeenCalledTimes(1);
		} else {
			expect(check).toHaveBeenCalledTimes(1);
			expect(prepareInstall).toHaveBeenCalledTimes(2);
			expect(relaunch).toHaveBeenCalledTimes(phase === "restart" ? 2 : 1);
		}
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledTimes(1);
	});
	test("split install accepts a reservation and retains it through Windows handoff", async () => {
		const { controller, update, release } = fixture();
		await controller.checkForUpdates();
		await controller.downloadUpdate();
		expect(await controller.installAndRestart(confirmation)).toBe("completed");
		expect(update.install).toHaveBeenCalledTimes(1);
		expect(get(controller.state).status).toBe("installer-handoff");
		expect(release).not.toHaveBeenCalled();
	});
});
