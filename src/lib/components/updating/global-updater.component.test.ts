import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeUpdateResource, UpdateSupport } from "$types/updateTypes";
import { createUpdaterController } from "$utils/updating/controller/controller";
import { createUpdaterSession } from "$utils/updating/session/session";
import GlobalUpdater from "./global-updater.svelte";

vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
afterEach(cleanup);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

const support: UpdateSupport = {
	mode: "self-managed",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: "windows-x86_64-nsis",
	checkTarget: "windows-x86_64-nsis",
	reason: "supported",
};

function expectSilent(container: HTMLElement) {
	expect(screen.queryByRole("status")).toBeNull();
	expect(screen.queryByRole("link", { name: "View update on About" })).toBeNull();
	// No empty banner/layout space left above the always-present admission gate.
	expect(container.children).toHaveLength(1);
	expect(container.firstElementChild?.hasAttribute("data-installation-gate")).toBe(true);
	expect((container.firstElementChild as HTMLElement & { inert: boolean }).inert).toBe(false);
}

describe("Global updater checks (real controller, mocked native boundary)", () => {
	it("keeps one startup support/feed check silent without automatically updating", async () => {
		const detection = deferred<UpdateSupport>();
		const feed = deferred<NativeUpdateResource | null>();
		const download = vi.fn(async () => {});
		const install = vi.fn(async () => {});
		const close = vi.fn(async () => {});
		const prepareInstall = vi.fn(async () => ({ release: vi.fn() }));
		const relaunch = vi.fn(async () => {});
		const candidate = { currentVersion: "3.6.1", version: "3.7.0", download, install, close };
		const detectSupport = vi.fn(() => detection.promise);
		const check = vi.fn(() => feed.promise);
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport,
			check,
			prepareInstall,
			relaunch,
		});
		const startCheck = vi.fn(() => controller.checkForUpdates());
		const session = createUpdaterSession(startCheck);
		const readiness = { native: true, development: false, languageReady: Promise.resolve() };
		const { container } = render(GlobalUpdater, { controller, reservation: writable(false) });
		expectSilent(container);
		await session.start(readiness);
		const operation = controller.checkForUpdates(); // Joins the pending startup operation.
		try {
			await waitFor(() => expect(detectSupport).toHaveBeenCalledTimes(1));
			expect(get(controller.state)).toMatchObject({ status: "checking", busy: "check" });
			expect(check).not.toHaveBeenCalled();
			expectSilent(container);
			detection.resolve(support);
			await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
			expect(check).toHaveBeenCalledWith({ target: "windows-x86_64-nsis", timeout: 15000 });
			expectSilent(container);
			feed.resolve(candidate);
			expect(await operation).toBe("completed");
			await waitFor(() => expect(get(controller.state).status).toBe("available"));
			expectSilent(container);
			await session.start(readiness);
			expect(startCheck).toHaveBeenCalledTimes(1);
			expect(check).toHaveBeenCalledTimes(1);
			expect(get(controller.state).availableUpdate?.version).toBe("3.7.0");
			expect(download).not.toHaveBeenCalled();
			expect(install).not.toHaveBeenCalled();
			expect(prepareInstall).not.toHaveBeenCalled();
			expect(relaunch).not.toHaveBeenCalled();
			expect(close).not.toHaveBeenCalled();
		} finally {
			detection.resolve(support);
			feed.resolve(candidate);
			await operation;
		}
	});
	it.each([
		"up-to-date",
		"support failure",
		"feed failure",
	] as const)("settles %s silently in the real controller", async (outcome) => {
		const detection = deferred<UpdateSupport>();
		const feed = deferred<NativeUpdateResource | null>();
		const detectSupport = vi.fn(() => detection.promise);
		const check = vi.fn(() => feed.promise);
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport,
			check,
		});
		const { container } = render(GlobalUpdater, { controller, reservation: writable(false) });
		const operation = controller.checkForUpdates();
		try {
			await waitFor(() => expect(detectSupport).toHaveBeenCalledTimes(1));
			expectSilent(container);
			if (outcome === "support failure") detection.reject(new Error("Support unavailable"));
			else {
				detection.resolve(support);
				await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
				expectSilent(container);
				if (outcome === "feed failure") feed.reject(new Error("Network offline"));
				else feed.resolve(null);
			}
			expect(await operation).toBe(outcome === "up-to-date" ? "completed" : "failed");
			expect(get(controller.state)).toMatchObject({
				status: outcome === "up-to-date" ? "up-to-date" : "error",
				busy: null,
			});
			if (outcome !== "up-to-date") {
				expect(get(controller.state).failure?.phase).toBe(
					outcome === "support failure" ? "support" : "check",
				);
			}
			await waitFor(() => expectSilent(container));
			expect(check).toHaveBeenCalledTimes(outcome === "support failure" ? 0 : 1);
		} finally {
			detection.resolve(support);
			feed.resolve(null);
			await operation;
		}
	});

	it("keeps failed-check disposal and explicit cleanup/check retry silent", async () => {
		const disposal = deferred<void>();
		const retryDisposal = deferred<void>();
		const close = vi
			.fn()
			.mockImplementationOnce(() => disposal.promise)
			.mockImplementationOnce(() => retryDisposal.promise);
		const download = vi.fn(async () => {});
		const install = vi.fn(async () => {});
		const relaunch = vi.fn(async () => {});
		// A malformed owned resource forces disposal before the check lock can settle.
		const check = vi
			.fn()
			.mockResolvedValueOnce({
				currentVersion: "3.6.1",
				version: "",
				download,
				install,
				close,
			})
			.mockResolvedValueOnce(null);
		const detectSupport = vi.fn(async () => support);
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport,
			check,
			relaunch,
		});
		const { container } = render(GlobalUpdater, { controller, reservation: writable(false) });
		const operation = controller.checkForUpdates();
		try {
			await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
			expect(get(controller.state)).toMatchObject({
				status: "error",
				busy: "check",
				failure: { phase: "check" },
			});
			expectSilent(container);
			disposal.reject(new Error("Close failed"));
			expect(await operation).toBe("failed");
			await waitFor(() => expectSilent(container));
			expect(get(controller.state).failure?.phase).toBe("cleanup");
		} finally {
			disposal.resolve();
			await operation;
		}
		const retry = controller.retry();
		try {
			await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
			expect(get(controller.state)).toMatchObject({ status: "checking", busy: "check" });
			expectSilent(container);
			expect(check).toHaveBeenCalledTimes(1); // Quarantine cleanup precedes a fresh feed check.
			expect(detectSupport).toHaveBeenCalledTimes(2);
			retryDisposal.resolve();
			expect(await retry).toBe("completed");
			await waitFor(() => expectSilent(container));
			expect(get(controller.state)).toMatchObject({ status: "up-to-date", busy: null });
			expect(check).toHaveBeenCalledTimes(2);
			expect(download).not.toHaveBeenCalled();
			expect(install).not.toHaveBeenCalled();
			expect(relaunch).not.toHaveBeenCalled();
		} finally {
			retryDisposal.resolve();
			await retry;
		}
	});
});

describe("Global updater status and admission UI (synthetic state)", () => {
	it.each([
		["downloading", "download", "Downloading and verifying the update…"],
		["downloading", "update", "Downloading and verifying the update…"],
		["ready-to-install", "update", "Download verified. Ready to continue the update."],
		["installing", "install", "Installing the verified update…"],
		["installer-handoff", null, "The installer is taking over."],
		["restarting", "restart", "Restarting the app…"],
		["restart-required", null, "Restart required"],
	] as const)("retains %s status during %s", (status, busy, message) => {
		const initial = get(
			createUpdaterController({
				currentVersion: "3.6.1",
				detectSupport: async () => null,
				check: async () => null,
			}).state,
		);
		const state = writable({ ...initial, status, busy });
		render(GlobalUpdater, { controller: { state }, reservation: writable(false) });
		expect(screen.getByRole("status").textContent).toContain(message);
		expect(
			screen.getByRole("link", { name: "View update on About" }).getAttribute("href"),
		).toBe("/about");
	});

	it("leaves download UI usable, gates the subtree on reservation, then restores it on released failure", async () => {
		const initial = get(
			createUpdaterController({
				currentVersion: "3.6.1",
				detectSupport: async () => null,
				check: async () => null,
			}).state,
		);
		const state = writable({
			...initial,
			status: "downloading" as const,
			busy: "download" as const,
		});
		const reservation = writable(false);
		const children = createRawSnippet(() => ({
			render: () =>
				'<div><input aria-label="Draft" /><button type="button">Mutate</button></div>',
		}));
		render(GlobalUpdater, { controller: { state }, reservation, children });
		const gate = screen
			.getByRole("button", { name: "Mutate" })
			.closest("[data-installation-gate]");
		expect((gate as HTMLElement & { inert: boolean })?.inert).toBe(false);
		expect(screen.getByRole("status").textContent).toContain(
			"Downloading and verifying the update…",
		);
		expect(
			screen.getByRole("link", { name: "View update on About" }).getAttribute("href"),
		).toBe("/about");
		reservation.set(true);
		await waitFor(() => expect((gate as HTMLElement & { inert: boolean })?.inert).toBe(true));
		expect(screen.getByRole("status").textContent).toContain(
			"Editing and new actions are temporarily paused.",
		);
		expect(document.activeElement).toBe(screen.getByRole("status"));
		expect(screen.queryByRole("link", { name: "View update on About" })).toBeNull();
		reservation.set(false);
		await waitFor(() => expect((gate as HTMLElement & { inert: boolean })?.inert).toBe(false));
		expect(screen.getByRole("link", { name: "View update on About" })).toBeTruthy();
	});
});
