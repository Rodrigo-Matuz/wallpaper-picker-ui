import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { Toaster, toast } from "svelte-sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goto } from "$app/navigation";
import { createApplicationWorkTracker } from "$utils/applicationWork/applicationWork";
import { createUpdaterController } from "$utils/updating/controller/controller";
import { createUpdaterSession } from "$utils/updating/session/session";
import HomeNotice from "./home-notice.svelte";
import Panel from "./panel.svelte";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
afterEach(() => {
	toast.dismiss();
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});
beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
});

const support = {
	mode: "self-managed",
	platform: "linux",
	architecture: "x86_64",
	installer: "appimage",
	target: "linux-x86_64-appimage",
	reason: "supported",
};

describe("updater component flow (mocked resources, not native acceptance)", () => {
	it("drives one real controller intent through verified download, install and restart", async () => {
		let finishDownload!: () => void;
		const install = vi.fn(async () => {});
		const relaunch = vi.fn(async () => {});
		const download = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishDownload = resolve;
				}),
		);
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => support,
			check: async () => ({
				currentVersion: "3.6.1",
				version: "3.7.0",
				download,
				install,
				close: async () => {},
			}),
			prepareInstall: async () => ({ release: () => {} }),
			relaunch,
		});
		await controller.checkForUpdates();
		render(Panel, { controller });
		expect(download).not.toHaveBeenCalled();
		expect(install).not.toHaveBeenCalled();
		expect(relaunch).not.toHaveBeenCalled();
		try {
			await fireEvent.click(screen.getByRole("button", { name: "Update to 3.7.0" }));
			await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
			expect(screen.getByRole("progressbar")).toBeTruthy();
			expect(screen.queryByText(/In-app installation is disabled/)).toBeNull();
			expect(install).not.toHaveBeenCalled();
			finishDownload();
			await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1));
			expect(install).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole("button", { name: /^Install/ })).toBeNull();
		} finally {
			finishDownload?.();
		}
	});

	it("retains an off-Home result, exposes accessible About/dismiss controls and does not dispose on dismiss", async () => {
		const close = vi.fn(async () => {});
		const download = vi.fn(async () => {});
		const install = vi.fn(async () => {});
		const relaunch = vi.fn(async () => {});
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => support,
			check: async () => ({
				currentVersion: "3.6.1",
				version: "3.7.0",
				download,
				install,
				close,
			}),
			prepareInstall: async () => ({ release: () => {} }),
			relaunch,
		});
		const check = vi.spyOn(controller, "checkForUpdates");
		const session = createUpdaterSession(() => controller.checkForUpdates());
		// No Home component is mounted when the launch check's result arrives.
		const readiness = { native: true, development: false, languageReady: Promise.resolve() };
		await session.start(readiness);
		await waitFor(() => expect(get(controller.state).status).toBe("available"));
		render(Toaster, {
			closeButtonAriaLabel: "Dismiss update notice",
			containerAriaLabel: "Notifications",
		});
		const notice = render(HomeNotice, { controller, session, readyStore: writable(true) });
		await screen.findByText("Update 3.7.0 is available");
		const about = screen.getByRole("button", { name: "View update on About" });
		expect(about.tagName).toBe("BUTTON");
		await fireEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }));
		expect(close).not.toHaveBeenCalled();
		expect(get(controller.state).availableUpdate?.version).toBe("3.7.0");
		render(Panel, { controller });
		expect(screen.getByRole("button", { name: "Update to 3.7.0" })).toBeTruthy();
		notice.unmount();
		render(HomeNotice, { controller, session, readyStore: writable(true) });
		await session.start(readiness);
		expect(check).toHaveBeenCalledTimes(1);
		expect(download).not.toHaveBeenCalled();
		expect(install).not.toHaveBeenCalled();
		expect(relaunch).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});

	it("waits for another explicit Update click after dirty-input admission denial", async () => {
		const work = createApplicationWorkTracker();
		const releaseDirty = work.beginDirtyInput();
		const download = vi.fn(async () => {});
		const install = vi.fn(async () => {});
		const relaunch = vi.fn(async () => {});
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => support,
			check: async () => ({
				currentVersion: "3.6.1",
				version: "3.7.0",
				download,
				install,
				close: async () => {},
			}),
			prepareInstall: async () => work.tryReserveInstall(),
			relaunch,
		});
		try {
			await controller.checkForUpdates();
			render(Panel, { controller });
			await fireEvent.click(screen.getByRole("button", { name: "Update to 3.7.0" }));
			await waitFor(() => expect(get(controller.state).installBlocked).toBe(true));
			expect(download).toHaveBeenCalledTimes(1);
			expect(install).not.toHaveBeenCalled();
			expect(work.getSnapshot().dirtyInputs).toBe(1);
		} finally {
			releaseDirty();
		}
		const retry = await screen.findByRole("button", { name: "Retry update to 3.7.0" });
		expect(install).not.toHaveBeenCalled();
		expect(relaunch).not.toHaveBeenCalled();
		await fireEvent.click(retry);
		await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1));
		expect(download).toHaveBeenCalledTimes(1);
		expect(install).toHaveBeenCalledTimes(1);
	});
});
