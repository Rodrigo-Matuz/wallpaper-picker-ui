import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { Toaster, toast } from "svelte-sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentLanguage, t } from "$lang/index";
import type { NativeUpdateResource, UpdaterCheckOptions } from "$types/updateTypes";
import { createUpdaterController } from "$utils/updating/controller/controller";
import { readOnlyAppImageWire } from "$utils/updating/native-wire.fixture";
import { createUpdaterSession } from "$utils/updating/session/session";
import HomeNotice from "./home-notice.svelte";
import Panel from "./panel.svelte";

// Routing is a host boundary; controller, session, translations and UI are real.
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
});
afterEach(() => {
	toast.dismiss();
	cleanup();
	currentLanguage.set("eng");
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const checkOnlySupport = {
	mode: "manual-only",
	platform: "windows",
	architecture: "x86_64",
	installer: "nsis",
	target: null,
	checkTarget: "windows-x86_64-nsis",
	reason: "native-validation-pending",
} as const;

function fixture(policy: unknown = checkOnlySupport) {
	const resource = {
		currentVersion: "3.6.1",
		version: "3.7.0",
		body: "<b>New release notes</b>",
		download: vi.fn(async () => {}),
		install: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
	};
	const detectSupport = vi.fn(async (): Promise<unknown> => policy);
	const check = vi.fn(
		async (_options: UpdaterCheckOptions): Promise<NativeUpdateResource | null> => resource,
	);
	const prepareInstall = vi.fn(async () => ({ release() {} }));
	const relaunch = vi.fn(async () => {});
	const controller = createUpdaterController({
		currentVersion: "3.6.1",
		detectSupport,
		check,
		prepareInstall,
		relaunch,
		now: () => 1700000000000,
	});
	const session = createUpdaterSession(() => controller.checkForUpdates());
	return { controller, session, resource, detectSupport, check, prepareInstall, relaunch };
}

const readiness = { native: true, development: false, languageReady: Promise.resolve() };

function expectNoInstallation(f: ReturnType<typeof fixture>) {
	expect(f.resource.download).not.toHaveBeenCalled();
	expect(f.resource.install).not.toHaveBeenCalled();
	expect(f.prepareInstall).not.toHaveBeenCalled();
	expect(f.relaunch).not.toHaveBeenCalled();
}

describe("check-only installed flow (native boundary mocked, not packaged acceptance)", () => {
	it("no longer publishes MSI installers and offers only manual NSIS migration via releases", async () => {
		const f = fixture({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		await f.controller.checkForUpdates();
		render(Panel, { controller: f.controller });
		expect(
			screen.getByText(
				"Windows MSI installers are no longer published. Back up your data and migrate manually to the NSIS setup.exe from the releases page. Automatic installer conversion is not supported.",
			),
		).toBeTruthy();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		expect(get(f.controller.state)).toMatchObject({
			canDownload: false,
			canInstall: false,
			canUpdate: false,
			support: { installer: "msi", target: null, checkTarget: "windows-x86_64-msi" },
		});
		expectNoInstallation(f);
	});
	it.each([
		[
			"eng",
			"Windows MSI installers are no longer published. Back up your data and migrate manually to the NSIS setup.exe from the releases page. Automatic installer conversion is not supported.",
		],
		[
			"pt-br",
			"Instaladores MSI para Windows não são mais publicados. Faça backup dos seus dados e migre manualmente para o setup.exe NSIS da página de versões. A conversão automática entre instaladores não é suportada.",
		],
		[
			"es",
			"Ya no se publican instaladores MSI para Windows. Haz una copia de seguridad de tus datos y migra manualmente al setup.exe de NSIS desde la página de versiones. No se admite la conversión automática entre instaladores.",
		],
		[
			"fr",
			"Les programmes d’installation MSI pour Windows ne sont plus publiés. Sauvegardez vos données et migrez manuellement vers le setup.exe NSIS depuis la page des versions. La conversion automatique entre programmes d’installation n’est pas prise en charge.",
		],
		[
			"de",
			"Windows-MSI-Installationsprogramme werden nicht mehr veröffentlicht. Sichern Sie Ihre Daten und wechseln Sie manuell zum NSIS-setup.exe von der Versionsseite. Eine automatische Umstellung zwischen Installationsprogrammen wird nicht unterstützt.",
		],
		[
			"unknown-locale",
			"Windows MSI installers are no longer published. Back up your data and migrate manually to the NSIS setup.exe from the releases page. Automatic installer conversion is not supported.",
		],
	])("resolves MSI migration guidance in %s with a releases-only link and no native effects", async (language, guidance) => {
		const f = fixture({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		await f.controller.checkForUpdates();
		currentLanguage.set(language);
		const translate = get(t);
		expect(translate("updater.guidance.msi")).toBe(guidance);
		expect(translate("updater.guidance.msi")).not.toBe("updater.guidance.msi");
		render(Panel, { controller: f.controller });
		expect(screen.getByText(guidance)).toBeTruthy();
		const link = screen.getByRole("link", { name: translate("updater.releases") });
		expect(screen.getAllByRole("link")).toHaveLength(1);
		expect(link.getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases",
		);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		const before = get(f.controller.state);
		link.addEventListener("click", (event) => event.preventDefault(), { once: true });
		await fireEvent.click(link);
		expect(get(f.controller.state)).toBe(before);
		expect(before).toMatchObject({
			status: "available",
			canDownload: false,
			canInstall: false,
			canUpdate: false,
			support: { installer: "msi", target: null, checkTarget: "windows-x86_64-msi" },
		});
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.check).toHaveBeenCalledWith({ target: "windows-x86_64-msi", timeout: 15000 });
		expect(f.resource.close).not.toHaveBeenCalled();
		expectNoInstallation(f);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText(translate("updater.guidance.manual"))).toBeNull();
		expect(screen.queryByText(translate("updater.status.ready"))).toBeNull();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		expect(document.body.textContent).not.toContain("updater.");
	});
	it.each([
		"current",
		"offline",
		"missing-msi-target",
	] as const)("retains MSI migration guidance for %s without verified metadata or installer conversion", async (outcome) => {
		const f = fixture({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		if (outcome === "current") f.check.mockResolvedValueOnce(null);
		else
			f.check.mockRejectedValueOnce(
				new Error(outcome === "offline" ? "network offline" : "missing target"),
			);
		await f.controller.checkForUpdates();
		render(Panel, { controller: f.controller });
		const translate = get(t);
		expect(screen.getByText(translate("updater.guidance.msi"))).toBeTruthy();
		expect(screen.queryByText(translate("updater.status.ready"))).toBeNull();
		expect(screen.queryByText("3.7.0")).toBeNull();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		if (outcome === "current") {
			expect(screen.getByRole("status").textContent).toContain(
				translate("updater.status.current"),
			);
			expect(document.querySelector("time")).not.toBeNull();
		} else {
			expect(get(f.controller.state).failure).toEqual({
				phase: "check",
				category: outcome === "offline" ? "network" : "missing-target",
			});
			expect(screen.getByRole("status").textContent).toContain(
				translate("updater.failure.check"),
			);
			expect(screen.queryByText(translate("updater.status.current"))).toBeNull();
			expect(document.querySelector("time")).toBeNull();
		}
		expect(get(f.controller.state)).toMatchObject({
			availableUpdate: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
			support: { installer: "msi", target: null, checkTarget: "windows-x86_64-msi" },
		});
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(await f.controller.installAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(await f.controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.check).toHaveBeenCalledWith({ target: "windows-x86_64-msi", timeout: 15000 });
		expect(f.resource.close).not.toHaveBeenCalled();
		expectNoInstallation(f);
	});
	it.each([
		"missing",
		null,
		undefined,
		"windows-x86_64-nsis",
	])("does not convert legacy MSI check target %s to an NSIS feed or installer", async (checkTarget) => {
		const policy: Record<string, unknown> = {
			...checkOnlySupport,
			installer: "msi",
			checkTarget,
		};
		if (checkTarget === "missing") delete policy.checkTarget;
		const f = fixture(policy);
		// A completed policy detection is not a completed feed check or verified payload.
		expect(await f.controller.checkForUpdates()).toBe("completed");
		render(Panel, { controller: f.controller });
		expect(f.check).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			status: "manual-only",
			availableUpdate: null,
			lastCheckedAt: null,
			canCheck: false,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		if (checkTarget === undefined) {
			// Explicit undefined is malformed wire data, not trusted legacy MSI provenance.
			expect(get(f.controller.state).support).toMatchObject({
				mode: "unknown",
				installer: null,
				reason: "invalid-support",
			});
			expect(screen.getByText(get(t)("updater.guidance.unavailable"))).toBeTruthy();
			expect(screen.queryByText(get(t)("updater.guidance.msi"))).toBeNull();
		} else {
			expect(get(f.controller.state).support).toMatchObject({
				mode: "manual-only",
				installer: "msi",
				target: null,
			});
			expect(screen.getByText(get(t)("updater.guidance.msi"))).toBeTruthy();
		}
		expect(document.querySelector("time")).toBeNull();
		expect(document.querySelector('a[href*="/releases/download/"]')).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(await f.controller.installAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(await f.controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(f.resource.close).not.toHaveBeenCalled();
		expectNoInstallation(f);
	});
	it.each([
		null,
		{},
		{
			mode: "manual-only",
			platform: "windows",
			architecture: "x86_64",
			installer: "nsis",
			target: null,
			reason: "native-validation-pending",
		},
		{ ...checkOnlySupport, checkTarget: null },
		{ ...checkOnlySupport, checkTarget: undefined },
		{ ...checkOnlySupport, checkTarget: "windows-x86_64" },
		{ ...checkOnlySupport, checkTarget: "windows-x86_64-msi" },
		{ ...checkOnlySupport, checkTarget: 42 },
		{ ...checkOnlySupport, installer: null },
		{ ...checkOnlySupport, platform: "browser" },
		{ ...checkOnlySupport, platform: "linux" },
		{ ...checkOnlySupport, architecture: "aarch64" },
		{ ...checkOnlySupport, mode: "development" },
		{ ...checkOnlySupport, mode: "unknown" },
		{ ...checkOnlySupport, mode: "package-managed" },
		{ ...checkOnlySupport, mode: "self-managed" },
		{ ...checkOnlySupport, reason: "unknown-installation" },
		{ ...checkOnlySupport, reason: "appimage-read-only" },
		{ ...checkOnlySupport, reason: "appimage-invalid" },
		{ ...checkOnlySupport, target: "windows-x86_64-nsis" },
		{
			...checkOnlySupport,
			platform: "linux",
			installer: "deb",
			checkTarget: "linux-x86_64-appimage",
		},
		{
			...checkOnlySupport,
			platform: "linux",
			installer: "rpm",
			checkTarget: "linux-x86_64-appimage",
		},
		{
			...checkOnlySupport,
			platform: "linux",
			installer: "nix",
			checkTarget: "linux-x86_64-appimage",
		},
		{
			...checkOnlySupport,
			mode: "self-managed",
			reason: "supported",
			target: "windows-x86_64-nsis",
			checkTarget: null,
		},
		{
			...checkOnlySupport,
			mode: "self-managed",
			reason: "supported",
			target: "windows-x86_64-nsis",
			checkTarget: "windows-x86_64-msi",
		},
	])("denies malformed, missing, generic, external or contradictory support %# without fallback", async (policy) => {
		const f = fixture(policy);
		await f.controller.checkForUpdates();
		expect(f.check).not.toHaveBeenCalled();
		expect(get(f.controller.state)).toMatchObject({
			status: "manual-only",
			availableUpdate: null,
			lastCheckedAt: null,
			canCheck: false,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		render(Panel, { controller: f.controller });
		expect(screen.queryByText("3.7.0")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(await f.controller.installAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(await f.controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expectNoInstallation(f);
	});
	it("reports offline availability as unknown with manual guidance and no automatic retry", async () => {
		const f = fixture();
		f.check.mockRejectedValueOnce(new Error("network offline"));
		await f.session.start(readiness);
		await waitFor(() => expect(get(f.controller.state).status).toBe("error"));
		render(Panel, { controller: f.controller });
		expect(screen.getByRole("status").textContent).toContain(get(t)("updater.failure.check"));
		expect(screen.getByText(get(t)("updater.error.network"))).toBeTruthy();
		expect(screen.getByText(get(t)("updater.guidance.manual"))).toBeTruthy();
		expect(screen.queryByText(get(t)("updater.status.current"))).toBeNull();
		expect(screen.queryByText(get(t)("updater.guidance.unavailable"))).toBeNull();
		expect(document.querySelector("time")).toBeNull();
		expect(screen.queryByRole("button", { name: /^Update to/ })).toBeNull();
		await f.session.start(readiness);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(get(f.controller.state)).toMatchObject({
			lastCheckedAt: null,
			availableUpdate: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		expectNoInstallation(f);
	});
	it("reports a completed non-newer check truthfully with manual guidance, not an unchecked claim", async () => {
		const f = fixture();
		f.check.mockResolvedValueOnce(null);
		await f.session.start(readiness);
		await waitFor(() => expect(get(f.controller.state).status).toBe("up-to-date"));
		render(Panel, { controller: f.controller });
		expect(screen.getByRole("status").textContent).toContain(get(t)("updater.status.current"));
		expect(screen.getByText(get(t)("updater.guidance.manual"))).toBeTruthy();
		expect(screen.queryByText(get(t)("updater.guidance.unavailable"))).toBeNull();
		expect(screen.queryByText("3.7.0")).toBeNull();
		expect(get(f.controller.state)).toMatchObject({
			lastCheckedAt: 1700000000000,
			availableUpdate: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		await f.session.start(readiness);
		expect(f.check).toHaveBeenCalledTimes(1);
		expectNoInstallation(f);
	});
	it("retains availability for a validated read-only AppImage without offering installation", async () => {
		const f = fixture(readOnlyAppImageWire());
		expect(await f.controller.checkForUpdates()).toBe("completed");
		expect(f.check).toHaveBeenCalledWith({ target: "linux-x86_64-appimage", timeout: 15000 });
		expect(get(f.controller.state)).toMatchObject({
			status: "available",
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		render(Panel, { controller: f.controller });
		expect(screen.getByText(get(t)("updater.guidance.manual"))).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
		expectNoInstallation(f);
	});
	it("disposes an acquired resource if provenance changes before its metadata is accepted", async () => {
		const f = fixture();
		f.detectSupport.mockResolvedValueOnce(checkOnlySupport).mockResolvedValueOnce({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		expect(await f.controller.checkForUpdates()).toBe("not-available");
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(f.resource.close).toHaveBeenCalledTimes(1);
		expect(get(f.controller.state)).toMatchObject({
			status: "manual-only",
			availableUpdate: null,
			lastCheckedAt: null,
			canDownload: false,
			canInstall: false,
			canUpdate: false,
		});
		render(Panel, { controller: f.controller });
		expect(screen.queryByText("3.7.0")).toBeNull();
		expect(screen.queryByRole("button", { name: /^Update/ })).toBeNull();
		expectNoInstallation(f);
	});
	it.each([
		"eng",
		"pt-br",
		"es",
		"fr",
		"de",
		"unknown-locale",
	])("provides translated manual guidance beside available metadata in %s", async (language) => {
		const f = fixture();
		await f.controller.checkForUpdates();
		currentLanguage.set(language);
		render(Panel, { controller: f.controller });
		const translate = get(t);
		const guidance = translate("updater.guidance.manual");
		expect(guidance).not.toBe("updater.guidance.manual");
		expect(screen.getByText(guidance)).toBeTruthy();
		expect(screen.getByText(translate("updater.version.installed"))).toBeTruthy();
		expect(screen.getByText(translate("updater.version.available"))).toBeTruthy();
		expect(screen.getByText(translate("updater.notes"))).toBeTruthy();
		expect(
			screen.getByRole("link", { name: translate("updater.releases") }).getAttribute("href"),
		).toBe("https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases");
		expect(document.body.textContent).not.toContain("updater.");
		expect(document.body.textContent).not.toContain(translate("updater.guidance.unavailable"));
		expect(screen.queryByRole("button")).toBeNull();
		expectNoInstallation(f);
	});
	it.each([
		checkOnlySupport,
		{ ...checkOnlySupport, installer: "msi", checkTarget: "windows-x86_64-msi" },
		{
			...checkOnlySupport,
			platform: "linux",
			installer: "appimage",
			checkTarget: "linux-x86_64-appimage",
		},
		readOnlyAppImageWire(),
	])("checks once on startup and retains newer metadata/notice without installation authority %#", async (policy) => {
		const f = fixture(policy);
		await f.session.start(readiness);
		await waitFor(() => expect(get(f.controller.state).status).toBe("available"));
		expect(f.check).toHaveBeenCalledWith({ target: policy.checkTarget, timeout: 15000 });
		expect(get(f.controller.state)).toMatchObject({
			availableUpdate: { version: "3.7.0", body: "<b>New release notes</b>" },
			canDownload: false,
			canInstall: false,
			canUpdate: false,
			support: { target: null, checkTarget: policy.checkTarget },
		});
		render(Toaster, {
			closeButtonAriaLabel: "Dismiss update notice",
			containerAriaLabel: "Notifications",
		});
		const notice = render(HomeNotice, {
			controller: f.controller,
			session: f.session,
			readyStore: writable(true),
		});
		await screen.findByText("Update 3.7.0 is available");
		expect(screen.getByRole("button", { name: "View update on About" })).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }));
		render(Panel, { controller: f.controller });
		expect(screen.getByText("3.6.1")).toBeTruthy();
		expect(screen.getByText("3.7.0")).toBeTruthy();
		expect(screen.getByText("<b>New release notes</b>")).toBeTruthy();
		expect(document.querySelector("b")).toBeNull();
		expect(screen.queryByRole("button", { name: /^Update to/ })).toBeNull();
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(await f.controller.installAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		expect(await f.controller.updateAndRestart({ confirmed: true, version: "3.7.0" })).toBe(
			"not-available",
		);
		notice.unmount();
		render(HomeNotice, {
			controller: f.controller,
			session: f.session,
			readyStore: writable(true),
		});
		await f.session.start(readiness);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.resource.close).not.toHaveBeenCalled();
		expect(get(f.controller.state).availableUpdate?.version).toBe("3.7.0");
		expectNoInstallation(f);
	});
});
