import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { Toaster, toast } from "svelte-sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goto } from "$app/navigation";
import { currentLanguage, t } from "$lang/index";
import type { AvailableUpdate, UpdateSupport } from "$types/updateTypes";
import { createUpdaterController } from "$utils/updating/controller/controller";
import { createUpdaterSession } from "$utils/updating/session/session";
import HomeNotice from "./home-notice.svelte";
import Panel from "./panel.svelte";

// Only native/host boundaries are mocked; controller, session, locales and Sonner are real.
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
});
afterEach(() => {
	toast.dismiss();
	cleanup();
	currentLanguage.set("eng");
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

const policies: UpdateSupport[] = [
	{
		mode: "package-managed",
		platform: "linux",
		architecture: "x86_64",
		installer: "deb",
		target: null,
		checkTarget: null,
		reason: "package-managed",
	},
	{
		mode: "package-managed",
		platform: "linux",
		architecture: "x86_64",
		installer: "rpm",
		target: null,
		checkTarget: null,
		reason: "package-managed",
	},
	{
		mode: "package-managed",
		platform: "linux",
		architecture: "x86_64",
		installer: "nix",
		target: null,
		checkTarget: null,
		reason: "nix-managed",
	},
	{
		mode: "manual-only",
		platform: "linux",
		architecture: "x86_64",
		installer: "appimage",
		target: null,
		checkTarget: "linux-x86_64-appimage",
		reason: "native-validation-pending",
	},
	{
		mode: "manual-only",
		platform: "linux",
		architecture: "x86_64",
		installer: "appimage",
		target: null,
		checkTarget: "linux-x86_64-appimage",
		reason: "app-image-read-only",
	},
];
const metadata: AvailableUpdate = {
	currentVersion: "3.6.9",
	version: "3.7.0+upstream.1",
	body: "## Changes\n**Safe** release\nThird\nFourth\nFifth\nTAIL <img src=x>",
	date: "2026-10-14T00:00:00Z",
};

function fixture(policy: UpdateSupport) {
	const resource = {
		...metadata,
		download: vi.fn(async () => {}),
		install: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
	};
	const check = vi.fn(async () => resource);
	const checkReleaseNotice = vi.fn(async (): Promise<AvailableUpdate | null> => metadata);
	const prepareInstall = vi.fn(async () => ({ release: vi.fn() }));
	const relaunch = vi.fn(async () => {});
	const detectSupport = vi.fn(async () => policy);
	const controller = createUpdaterController({
		currentVersion: "3.6.9",
		detectSupport,
		check,
		checkReleaseNotice,
		prepareInstall,
		relaunch,
	});
	const session = createUpdaterSession(() => controller.checkForUpdates());
	return {
		controller,
		session,
		resource,
		check,
		checkReleaseNotice,
		prepareInstall,
		relaunch,
		detectSupport,
	};
}
function expectNoNativeResources(f: ReturnType<typeof fixture>) {
	expect(f.check).not.toHaveBeenCalled();
	expect(f.resource.download).not.toHaveBeenCalled();
	expect(f.resource.install).not.toHaveBeenCalled();
	expect(f.resource.close).not.toHaveBeenCalled();
	expect(f.prepareInstall).not.toHaveBeenCalled();
	expect(f.relaunch).not.toHaveBeenCalled();
}
function guidance(policy: UpdateSupport) {
	return get(t)(
		`updater.guidance.${policy.installer === "nix" ? "nix" : policy.installer === "appimage" ? "appimage" : "managed"}`,
	);
}

describe("Linux metadata-only release UI (real controller, native boundary mocked)", () => {
	it.each(
		policies,
	)("checks metadata once after readiness, notices off-Home detection once, and never owns a resource: $installer/$reason", async (policy) => {
		const f = fixture(policy);
		let ready!: () => void;
		const languageReady = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const readiness = { native: true, development: false, languageReady };
		const start = f.session.start(readiness);
		expect(f.detectSupport).not.toHaveBeenCalled();
		ready();
		await start;
		await waitFor(() => expect(get(f.controller.state).status).toBe("available"));
		expect(get(f.controller.state)).toMatchObject({
			releaseNoticeOnly: true,
			availableUpdate: metadata,
			canUpdate: false,
			canDownload: false,
			canInstall: false,
			busy: null,
		});
		render(Toaster, {
			closeButtonAriaLabel: "Dismiss update notice",
			containerAriaLabel: "Notifications",
		});
		// Home was unmounted while checking; mounting later consumes the retained notice.
		const readyStore = writable(false);
		const props = { controller: f.controller, session: f.session, readyStore };
		const home = render(HomeNotice, props);
		const message =
			"Wallpaper Picker UI 3.7.0+upstream.1 is available. Update through your usual installation method.";
		expect(screen.queryByText(message)).toBeNull();
		readyStore.set(true);
		await screen.findByText(message);
		await fireEvent.click(screen.getByRole("button", { name: "View update on About" }));
		expect(goto).toHaveBeenCalledExactlyOnceWith("/about");
		await fireEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }));
		home.unmount();
		const panel = render(Panel, { controller: f.controller });
		expect(screen.getByRole("status").textContent).toBe(message);
		expect(screen.getByText("3.6.9")).toBeTruthy();
		expect(screen.getByText(metadata.version)).toBeTruthy();
		expect(screen.getByText(guidance(policy))).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Changes" })).toBeTruthy();
		expect(screen.getByText("Safe").tagName).toBe("STRONG");
		await fireEvent.click(screen.getByRole("button", { name: "Read more" }));
		expect(screen.getByText("TAIL <img src=x>")).toBeTruthy();
		expect(document.querySelector("img")).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Read less" }));
		const before = get(f.controller.state);
		const link = screen.getByRole("link", { name: "Releases on GitHub" });
		link.addEventListener("click", (event) => event.preventDefault(), { once: true });
		await fireEvent.click(link);
		expect(get(f.controller.state)).toBe(before);
		expect(screen.queryByRole("button", { name: /Update to|Download|Install/ })).toBeNull();
		expect(await f.controller.downloadUpdate()).toBe("not-available");
		expect(
			await f.controller.installAndRestart({ confirmed: true, version: metadata.version }),
		).toBe("not-available");
		expect(
			await f.controller.updateAndRestart({ confirmed: true, version: metadata.version }),
		).toBe("not-available");
		panel.unmount();
		render(HomeNotice, props);
		await f.session.start(readiness);
		await Promise.resolve();
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "View update on About" })).toBeNull(),
		);
		expect(f.checkReleaseNotice).toHaveBeenCalledTimes(1);
		expectNoNativeResources(f);
	});
	it.each(
		policies,
	)("manual Check again uses only release metadata for $installer/$reason", async (policy) => {
		const f = fixture(policy);
		await f.controller.checkForUpdates();
		render(Panel, { controller: f.controller });
		f.checkReleaseNotice.mockResolvedValueOnce(null);
		await fireEvent.click(screen.getByRole("button", { name: "Check again" }));
		await waitFor(() => expect(get(f.controller.state).status).toBe("up-to-date"));
		expect(screen.getByText(guidance(policy))).toBeTruthy();
		expect(screen.getByRole("status").textContent).toBe(get(t)("updater.status.current"));
		expect(screen.queryByText(metadata.version)).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Check again" }));
		await waitFor(() => expect(get(f.controller.state).status).toBe("available"));
		expect(f.checkReleaseNotice).toHaveBeenCalledTimes(3);
		expectNoNativeResources(f);
	});
	it.each(
		policies,
	)("failed metadata checks retain $installer guidance without a false current claim", async (policy) => {
		const f = fixture(policy);
		f.checkReleaseNotice.mockRejectedValueOnce(new Error("network offline"));
		await f.controller.checkForUpdates();
		render(Panel, { controller: f.controller });
		expect(screen.getByRole("status").textContent).toBe(get(t)("updater.failure.check"));
		expect(screen.getByText(guidance(policy))).toBeTruthy();
		expect(screen.queryByText(get(t)("updater.status.current"))).toBeNull();
		expect(screen.queryByText(metadata.version)).toBeNull();
		expect(screen.queryByRole("button", { name: /Update to|Download|Install/ })).toBeNull();
		expect(f.checkReleaseNotice).toHaveBeenCalledTimes(1);
		expectNoNativeResources(f);
	});
});
