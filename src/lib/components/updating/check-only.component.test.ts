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
	it.each([
		[
			"eng",
			"Download {version} MSI installer (manual)",
			"MSI installations require a manual update. This button opens the installer download in your browser; close the app and run it yourself after backing up your data.",
		],
		[
			"pt-br",
			"Baixar instalador MSI {version} (manual)",
			"Instalações MSI exigem atualização manual. Este botão abre o download do instalador no navegador; faça backup dos seus dados, feche o app e execute o instalador por conta própria.",
		],
		[
			"es",
			"Descargar instalador MSI {version} (manual)",
			"Las instalaciones MSI requieren una actualización manual. Este botón abre la descarga del instalador en tu navegador; haz una copia de seguridad de tus datos, cierra la aplicación y ejecuta el instalador por tu cuenta.",
		],
		[
			"fr",
			"Télécharger le programme d’installation MSI {version} (manuel)",
			"Les installations MSI nécessitent une mise à jour manuelle. Ce bouton ouvre le téléchargement du programme d’installation dans votre navigateur ; sauvegardez vos données, fermez l’application et lancez vous-même le programme d’installation.",
		],
		[
			"de",
			"MSI-Installationsprogramm {version} herunterladen (manuell)",
			"MSI-Installationen müssen manuell aktualisiert werden. Diese Schaltfläche öffnet den Download des Installationsprogramms im Browser. Sichern Sie Ihre Daten, schließen Sie die App und führen Sie das Installationsprogramm selbst aus.",
		],
		[
			"unknown-locale",
			"Download {version} MSI installer (manual)",
			"MSI installations require a manual update. This button opens the installer download in your browser; close the app and run it yourself after backing up your data.",
		],
	])("resolves and renders the manual MSI action and guidance in %s without native click effects", async (language, action, guidance) => {
		const f = fixture({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		f.resource.version = "3.6.3";
		await f.controller.checkForUpdates();
		currentLanguage.set(language);
		const translate = get(t);
		expect(translate("updater.action.download.manual")).toBe(action);
		expect(translate("updater.guidance.msi")).toBe(guidance);
		render(Panel, { controller: f.controller });
		const explanation = screen.getByText(guidance);
		const link = screen.getByRole("link", { name: action.replace("{version}", "3.6.3") });
		expect(link.getAttribute("aria-describedby")).toBe(explanation.id);
		expect(explanation.id).not.toBe("");
		expect(link.getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.3/Wallpaper.Picker.UI_3.6.3_x64_en-US.msi",
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
		});
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.resource.close).not.toHaveBeenCalled();
		expectNoInstallation(f);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText(translate("updater.guidance.manual"))).toBeNull();
		expect(screen.queryByText(translate("updater.status.ready"))).toBeNull();
		expect(document.body.textContent).not.toContain("updater.");
	});
	it("offers an external manual MSI link without native effects or verified readiness", async () => {
		const f = fixture({
			...checkOnlySupport,
			installer: "msi",
			checkTarget: "windows-x86_64-msi",
		});
		f.resource.version = "3.6.3";
		await f.controller.checkForUpdates();
		render(Panel, { controller: f.controller });
		const before = get(f.controller.state);
		const link = screen.getByRole("link", { name: "Download 3.6.3 MSI installer (manual)" });
		expect(link.getAttribute("href")).toBe(
			"https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.3/Wallpaper.Picker.UI_3.6.3_x64_en-US.msi",
		);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		// Prevent jsdom navigation only; dispatch the actual component's link click.
		link.addEventListener("click", (event) => event.preventDefault(), { once: true });
		await fireEvent.click(link);
		expect(get(f.controller.state)).toBe(before);
		expect(before).toMatchObject({
			status: "available",
			canDownload: false,
			canInstall: false,
			canUpdate: false,
			installBlocked: false,
		});
		expect(f.detectSupport).toHaveBeenCalledTimes(2);
		expect(f.check).toHaveBeenCalledTimes(1);
		expect(f.check).toHaveBeenCalledWith({ target: "windows-x86_64-msi", timeout: 15000 });
		expect(f.resource.close).not.toHaveBeenCalled();
		expectNoInstallation(f);
		expect(screen.queryByRole("button")).toBeNull();
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
