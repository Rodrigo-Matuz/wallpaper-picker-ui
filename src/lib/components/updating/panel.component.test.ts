import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLanguage } from "$lang/index";
import type { UpdaterSnapshot } from "$types/updateTypes";
import { createUpdaterController } from "$utils/updating/controller/controller";
import Panel from "./panel.svelte";

vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
afterEach(() => {
	cleanup();
	currentLanguage.set("eng");
});

/** UI-only fixture; synthetic capabilities are not production/native availability. */
function fixture(
	overrides: Partial<UpdaterSnapshot> & { canUpdate?: boolean; installBlocked?: boolean } = {},
) {
	const initial = get(
		createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => null,
			check: async () => null,
		}).state,
	);
	const state = writable({ ...initial, canUpdate: false, installBlocked: false, ...overrides });
	return {
		state,
		checkForUpdates: vi.fn(async () => "completed" as const),
		updateAndRestart: vi.fn(
			async (_confirmation: { confirmed: true; version: string }) => "completed" as const,
		),
		retry: vi.fn(async () => "completed" as const),
	};
}

describe("About updater (synthetic resources, not native acceptance)", () => {
	it.each([
		["eng", "Updates", "Releases on GitHub"],
		["pt-br", "Atualizações", "Versões no GitHub"],
		["es", "Actualizaciones", "Versiones en GitHub"],
		["fr", "Mises à jour", "Versions sur GitHub"],
		["de", "Updates", "Versionen auf GitHub"],
	])("resolves registered %s updater strings without literal keys", (language, heading, releases) => {
		currentLanguage.set(language);
		render(Panel, { controller: fixture() });
		expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
		expect(screen.getByRole("link", { name: releases })).toBeTruthy();
		expect(document.body.textContent).not.toContain("updater.");
	});

	it.each([
		["support", "support-unavailable"],
		["check", "timeout"],
		["check", "missing-feed"],
		["check", "invalid-manifest"],
		["check", "missing-target"],
		["cleanup", "cleanup-failed"],
		["download", "invalid-signature"],
		["install", "install-failed"],
		["restart", "restart-failed"],
		["check", "unknown"],
	] as const)("renders translated %s/%s categories without raw backend text", (phase, category) => {
		render(Panel, {
			controller: fixture({ status: "error", canRetry: true, failure: { phase, category } }),
		});
		expect(screen.getByRole("status")).toBeTruthy();
		expect(document.body.textContent).not.toContain("updater.");
	});
	it.each([
		["checking", "Checking update support and availability…"],
		["up-to-date", "No newer version was found at the last completed check."],
		["ready-to-install", "Download verified. Ready to continue the update."],
		["installing", "Installing the verified update…"],
		[
			"installer-handoff",
			"The installer is taking over. The app will close; reopening is handled by the installer.",
		],
		["restarting", "Restarting the app…"],
	] as const)("announces %s truthfully rather than unavailable guidance", (status, message) => {
		render(Panel, { controller: fixture({ status }) });
		expect(screen.getByRole("status").textContent).toContain(message);
		expect(
			screen.queryByText(
				"In-app updating is unavailable for this installation. No update check has been completed.",
			),
		).toBeNull();
	});

	it("shows a last-check timestamp and explicit Check again only for supported completed checks", async () => {
		const controller = fixture({
			status: "up-to-date",
			canCheck: true,
			lastCheckedAt: 1700000000000,
			support: {
				mode: "self-managed",
				platform: "linux",
				architecture: "x86_64",
				installer: "appimage",
				target: "linux-x86_64-appimage",
				reason: "supported",
			},
		});
		render(Panel, { controller });
		expect(screen.getByText("Last completed check")).toBeTruthy();
		expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
			new Date(1700000000000).toISOString(),
		);
		await fireEvent.click(screen.getByRole("button", { name: "Check again" }));
		expect(controller.checkForUpdates).toHaveBeenCalledTimes(1);
	});

	it("does not turn retained metadata into update permission", () => {
		render(Panel, {
			controller: fixture({
				status: "available",
				canUpdate: false,
				availableUpdate: { currentVersion: "3.6.1", version: "3.7.0" },
			}),
		});
		expect(screen.getByText("3.7.0")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Update to 3.7.0" })).toBeNull();
	});
	it("announces progress and preserves indeterminate totals without enabling mutation actions", async () => {
		const controller = fixture({
			status: "downloading",
			busy: "download",
			progress: { downloadedBytes: 50, totalBytes: null, percent: null },
		});
		render(Panel, { controller });
		const progress = screen.getByRole("progressbar", {
			name: "Downloading and verifying the update…",
		});
		expect(progress.hasAttribute("aria-valuenow")).toBe(false);
		expect(screen.getByRole("status").textContent).toContain(
			"Downloading and verifying the update…",
		);
		expect(screen.queryByRole("button")).toBeNull();
		controller.state.update((value) => ({
			...value,
			progress: { downloadedBytes: 50, totalBytes: 100, percent: 50 },
		}));
		await waitFor(() =>
			expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50"),
		);
	});

	it("shows install-blocked guidance and requires an explicit retry", async () => {
		const controller = fixture({
			status: "ready-to-install",
			canUpdate: true,
			installBlocked: true,
			availableUpdate: { currentVersion: "3.6.1", version: "3.7.0" },
		});
		render(Panel, { controller });
		expect(
			screen.getByText(
				"Installation is paused. Finish pending work and save or discard edits yourself, then retry. Nothing was saved or discarded automatically.",
			),
		).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Retry update to 3.7.0" }));
		expect(controller.updateAndRestart).toHaveBeenCalledWith({
			confirmed: true,
			version: "3.7.0",
		});
		expect(controller.retry).not.toHaveBeenCalled();
	});

	it("explains restart-only recovery and routes explicit retry to the controller", async () => {
		const controller = fixture({
			status: "restart-required",
			canRetry: true,
			failure: { phase: "restart", category: "restart-failed" },
		});
		render(Panel, { controller });
		expect(
			screen.getByText(
				"The update is already installed. Retry only restarts the app; it will not download or install again.",
			),
		).toBeTruthy();
		expect(screen.getByRole("status").textContent).toContain("Restart failed");
		await fireEvent.click(screen.getByRole("button", { name: "Retry restart" }));
		expect(controller.retry).toHaveBeenCalledTimes(1);
		expect(controller.updateAndRestart).not.toHaveBeenCalled();
	});

	it("shows failed-check phase and category without claiming up to date or retrying automatically", async () => {
		const controller = fixture({
			status: "error",
			canRetry: true,
			failure: { phase: "check", category: "network" },
		});
		render(Panel, { controller });
		expect(screen.getByRole("status").textContent).toContain("Update check failed");
		expect(
			screen.getByText(
				"The update service could not be reached. Check your connection and retry.",
			),
		).toBeTruthy();
		expect(controller.retry).not.toHaveBeenCalled();
		expect(screen.queryByText("You are up to date.")).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(controller.retry).toHaveBeenCalledTimes(1);
	});

	it.each([
		[
			"nix",
			"package-managed",
			"Use your Nix flake or system configuration to update this app. In-app checks and installation are not available.",
		],
		[
			"deb",
			"package-managed",
			"Use the package manager or installation source that owns this app to update it.",
		],
		[
			null,
			"development",
			"In-app updating is disabled in browser and development sessions. No release check was performed.",
		],
	] as const)("provides policy-specific guidance for %s without feed or update actions", (installer, mode, guidance) => {
		const controller = fixture({
			status: "manual-only",
			support: {
				installer,
				mode,
				platform: "linux",
				architecture: "x86_64",
				target: null,
				reason: "synthetic",
			},
		});
		render(Panel, { controller });
		expect(screen.getByText(guidance)).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
		expect(controller.checkForUpdates).not.toHaveBeenCalled();
	});
	it("shows text-only notes and a single version-bound Update with close/restart consent", async () => {
		const controller = fixture({
			status: "available",
			canUpdate: true,
			availableUpdate: {
				currentVersion: "3.6.1",
				version: "3.7.0",
				body: "<img src=x onerror=alert(1)>\nRelease notes",
			},
		});
		const action = controller.updateAndRestart;
		render(Panel, { controller });
		expect(screen.getByText("3.7.0")).toBeTruthy();
		expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
		expect(document.querySelector("img")).toBeNull();
		const explanation = screen.getByText(
			"Update downloads and verifies this version, then closes and restarts the app. Finish your work first; system permission prompts may appear.",
		);
		const button = screen.getByRole("button", { name: "Update to 3.7.0" });
		expect(button.getAttribute("aria-describedby")).toBe(explanation.id);
		expect(screen.queryByRole("button", { name: /^Install/ })).toBeNull();
		await fireEvent.click(button);
		await waitFor(() =>
			expect(action).toHaveBeenCalledWith({ confirmed: true, version: "3.7.0" }),
		);
	});
	it("provides truthful unavailable guidance, no Update or up-to-date claim before a check", () => {
		const controller = createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => null,
			check: async () => null,
		});
		render(Panel, { controller });
		expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
		expect(
			screen.getByText(
				"In-app updating is unavailable for this installation. No update check has been completed.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: /^Update/ })).toBeNull();
		expect(screen.queryByText("You are up to date.")).toBeNull();
		expect(screen.getByRole("link", { name: "Releases on GitHub" }).getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases",
		);
	});
});
