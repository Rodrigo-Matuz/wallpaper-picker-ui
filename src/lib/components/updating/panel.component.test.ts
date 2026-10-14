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

function manualMsiFixture(overrides: Partial<UpdaterSnapshot> = {}) {
	return fixture({
		status: "available",
		availableUpdate: { currentVersion: "3.6.2", version: "3.6.3" },
		support: {
			mode: "manual-only",
			platform: "windows",
			architecture: "x86_64",
			installer: "msi",
			target: null,
			checkTarget: "windows-x86_64-msi",
			reason: "native-validation-pending",
		},
		...overrides,
	});
}

describe("legacy MSI migration presentation (synthetic state, no native effects)", () => {
	it.each([
		"idle",
		"manual-only",
		"available",
		"up-to-date",
		"error",
	] as const)("shows MSI retirement guidance in %s without authorizing installer conversion", (status) => {
		const controller = manualMsiFixture({
			status,
			availableUpdate:
				status === "available" ? { currentVersion: "3.6.2", version: "3.6.4" } : null,
			failure: status === "error" ? { phase: "check", category: "missing-target" } : null,
			lastCheckedAt: status === "available" || status === "up-to-date" ? 1700000000000 : null,
		});
		const before = get(controller.state);
		render(Panel, { controller });
		expect(
			screen.getByText(
				"Windows MSI installers are no longer published. Back up your data and migrate manually to the NSIS setup.exe from the releases page. Automatic installer conversion is not supported.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(1);
		expect(screen.getByRole("link", { name: "Releases on GitHub" }).getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases",
		);
		if (status === "idle" || status === "manual-only" || status === "error") {
			expect(document.querySelector("time")).toBeNull();
			expect(
				screen.queryByText("No newer version was found at the last completed check."),
			).toBeNull();
			expect(screen.queryByText("3.6.4")).toBeNull();
		}
		expect(screen.queryByText("Download verified. Ready to continue the update.")).toBeNull();
		expect(get(controller.state)).toBe(before);
		expect(controller.checkForUpdates).not.toHaveBeenCalled();
		expect(controller.updateAndRestart).not.toHaveBeenCalled();
		expect(controller.retry).not.toHaveBeenCalled();
	});
	it("does not treat contradictory MSI capabilities as automatic NSIS migration consent", () => {
		const controller = manualMsiFixture({
			canUpdate: true,
			canDownload: true,
			canInstall: true,
		});
		render(Panel, { controller });
		expect(screen.queryByRole("button", { name: /^Update to/ })).toBeNull();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		expect(controller.updateAndRestart).not.toHaveBeenCalled();
	});
});

describe("About updater (synthetic resources, not native acceptance)", () => {
	it.each([
		"version",
		"body",
		"disappear",
	])("resets expanded notes after candidate %s changes", async (change) => {
		const candidate = {
			currentVersion: "3.6.1",
			version: "3.7.0",
			body: "First\nSecond\nThird\nFourth\nFifth\nTAIL",
		};
		const controller = fixture({ status: "available", availableUpdate: candidate });
		render(Panel, { controller });
		await fireEvent.click(screen.getByRole("button", { name: "Read more" }));
		expect(screen.getByText("TAIL")).toBeTruthy();
		if (change === "disappear") {
			controller.state.update((value) => ({ ...value, availableUpdate: null }));
			await waitFor(() =>
				expect(screen.queryByRole("button", { name: "Read less" })).toBeNull(),
			);
		}
		controller.state.update((value) => ({
			...value,
			availableUpdate: {
				...candidate,
				version: change === "version" ? "3.8.0" : candidate.version,
				body: change === "body" ? `${candidate.body} changed` : candidate.body,
			},
		}));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Read more" }).getAttribute("aria-expanded"),
			).toBe("false"),
		);
		expect(screen.queryByText(/TAIL/)).toBeNull();
	});

	it.each([
		["eng", "Read more", "Read less"],
		["pt-br", "Ler mais", "Ler menos"],
		["es", "Leer más", "Leer menos"],
		["fr", "Lire la suite", "Réduire"],
		["de", "Mehr lesen", "Weniger lesen"],
		["unknown", "Read more", "Read less"],
	])("resolves real %s notes controls and fallback", async (language, more, less) => {
		currentLanguage.set(language);
		render(Panel, {
			controller: fixture({
				availableUpdate: {
					currentVersion: "3.6.1",
					version: "3.7.0",
					body: "Release notes. ".repeat(100),
				},
			}),
		});
		await fireEvent.click(screen.getByRole("button", { name: more }));
		expect(screen.getByRole("button", { name: less })).toBeTruthy();
		expect(document.body.textContent).not.toContain("updater.");
	});

	it.each([
		"Short **notes**",
		"One\nTwo\nThree\nFour\nFive",
		"x".repeat(360),
	])("does not offer a toggle for short notes: %s", (body) => {
		render(Panel, {
			controller: fixture({
				availableUpdate: { currentVersion: "3.6.1", version: "3.7.0", body },
			}),
		});
		expect(screen.queryByRole("button")).toBeNull();
	});
	it.each([
		["lines", "## Changes\n**First**\nSecond\nThird\nFourth\nSECRET TAIL"],
		["paragraph", `${"A long release paragraph. ".repeat(80)}SECRET TAIL`],
	])("collapses long %s notes accessibly without updater effects", async (_kind, body) => {
		const controller = fixture({
			status: "available",
			canUpdate: true,
			availableUpdate: {
				currentVersion: "3.6.1",
				version: "3.7.0",
				body,
			},
		});
		const before = get(controller.state);
		render(Panel, { controller });
		const more = screen.getByRole("button", { name: "Read more" });
		expect(more.getAttribute("aria-expanded")).toBe("false");
		const notes = document.getElementById(more.getAttribute("aria-controls") ?? "");
		expect(notes).not.toBeNull();
		expect(notes?.textContent).toContain("...");
		expect(notes?.textContent).not.toContain("SECRET TAIL");
		await fireEvent.click(more);
		const less = screen.getByRole("button", { name: "Read less" });
		expect(less.getAttribute("aria-expanded")).toBe("true");
		expect(notes?.textContent).toContain("SECRET TAIL");
		await fireEvent.click(less);
		expect(notes?.textContent).not.toContain("SECRET TAIL");
		await fireEvent.click(screen.getByRole("link", { name: "Releases on GitHub" }));
		expect(get(controller.state)).toBe(before);
		expect(controller.updateAndRestart).not.toHaveBeenCalled();
		expect(controller.checkForUpdates).not.toHaveBeenCalled();
		expect(controller.retry).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole("button", { name: "Update to 3.7.0" }));
		expect(controller.updateAndRestart).toHaveBeenCalledExactlyOnceWith({
			confirmed: true,
			version: "3.7.0",
		});
	});
	it("renders release headings and bold as escaped markup, never feed HTML or links", async () => {
		const body = [
			"# One",
			"## Two **important**",
			"### Three",
			"#### Four",
			"##### Five",
			"###### Six",
			"Plain **bold** and **unfinished",
			"<img src=x onerror=alert(1)> <script>alert(1)</script>",
			"[click](javascript:alert(1)) ![remote](https://example.com/pixel) <a href='javascript:alert(1)'>bad</a>",
		].join("\n");
		render(Panel, {
			controller: fixture({
				status: "available",
				availableUpdate: {
					currentVersion: "3.6.1",
					version: "3.7.0",
					body,
				},
			}),
		});
		await fireEvent.click(screen.getByRole("button", { name: "Read more" }));
		for (const [index, name] of [
			"One",
			"Two important",
			"Three",
			"Four",
			"Five",
			"Six",
		].entries()) {
			expect(screen.getByRole("heading", { name, level: index + 1 })).toBeTruthy();
		}
		expect(screen.getByText("important").tagName).toBe("STRONG");
		expect(screen.getByText("bold", { exact: true }).tagName).toBe("STRONG");
		expect(document.body.textContent).toContain("**unfinished");
		expect(document.querySelector("img, script, iframe")).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(1);
		expect(document.body.textContent).toContain("[click](javascript:alert(1))");
	});
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
		const checkButton = screen.getByRole("button", { name: "Check again" });
		const releases = screen.getByRole("link", { name: "Releases on GitHub" });
		expect(checkButton.parentElement).toBe(releases.parentElement);
		expect(releases.parentElement?.classList.contains("flex")).toBe(true);
		expect(releases.parentElement?.classList.contains("flex-wrap")).toBe(true);
		expect(releases.parentElement?.classList.contains("gap-x-4")).toBe(true);
		expect(releases.parentElement?.classList.contains("gap-y-3")).toBe(true);
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
		const releases = screen.getByRole("link", { name: "Releases on GitHub" });
		expect(button.parentElement).toBe(releases.parentElement);
		expect(button.parentElement?.classList.contains("flex-wrap")).toBe(true);
		expect(button.parentElement?.classList.contains("gap-x-4")).toBe(true);
		expect(button.parentElement?.classList.contains("gap-y-3")).toBe(true);
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
