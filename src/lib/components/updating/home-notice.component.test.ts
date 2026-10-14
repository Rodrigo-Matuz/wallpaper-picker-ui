import { cleanup, render, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { toast } from "svelte-sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { goto } from "$app/navigation";
import { currentLanguage, t } from "$lang/index";
import type { UpdaterSnapshot } from "$types/updateTypes";
import { createUpdaterController } from "$utils/updating/controller/controller";
import { createUpdaterSession } from "$utils/updating/session/session";
import HomeNotice from "./home-notice.svelte";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { info: vi.fn() } }));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
afterEach(() => {
	cleanup();
	currentLanguage.set("eng");
	vi.clearAllMocks();
});

function fixture() {
	const initial = get(
		createUpdaterController({
			currentVersion: "3.6.1",
			detectSupport: async () => null,
			check: async () => null,
		}).state,
	);
	return writable<UpdaterSnapshot>({
		...initial,
		status: "available",
		availableUpdate: { currentVersion: "3.6.1", version: "3.7.0" },
	});
}

describe("Home notices (synthetic state, no native acceptance)", () => {
	it.each([
		[
			"eng",
			"Wallpaper Picker UI 3.7.0 is available. Update through your usual installation method.",
		],
		[
			"pt-br",
			"Wallpaper Picker UI 3.7.0 está disponível. Atualize pelo seu método habitual de instalação.",
		],
		[
			"es",
			"Wallpaper Picker UI 3.7.0 está disponible. Actualiza mediante tu método habitual de instalación.",
		],
		[
			"fr",
			"Wallpaper Picker UI 3.7.0 est disponible. Mettez à jour avec votre méthode d’installation habituelle.",
		],
		[
			"de",
			"Wallpaper Picker UI 3.7.0 ist verfügbar. Aktualisieren Sie über Ihre übliche Installationsmethode.",
		],
		[
			"unknown-locale",
			"Wallpaper Picker UI 3.7.0 is available. Update through your usual installation method.",
		],
	])("resolves the actual %s release notice and English fallback", async (language, message) => {
		currentLanguage.set(language);
		const state = fixture();
		state.update((value) => ({ ...value, releaseNoticeOnly: true }));
		render(HomeNotice, {
			controller: { state },
			readyStore: writable(true),
			session: createUpdaterSession(async () => {}),
		});
		await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
		expect(get(t)("updater.notice.release.available").replace("{version}", "3.7.0")).toBe(
			message,
		);
		expect(vi.mocked(toast.info).mock.calls[0][0]).toBe(message);
	});
	it("announces a metadata-only Linux release without claiming an in-app update", async () => {
		const state = fixture();
		state.update((value) => ({ ...value, releaseNoticeOnly: true }));
		render(HomeNotice, {
			controller: { state },
			readyStore: writable(true),
			session: createUpdaterSession(async () => {}),
		});
		await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
		expect(vi.mocked(toast.info).mock.calls[0][0]).toBe(
			"Wallpaper Picker UI 3.7.0 is available. Update through your usual installation method.",
		);
		expect(vi.mocked(toast.info).mock.calls[0][1]).toMatchObject({
			closeButton: true,
			duration: 12000,
			action: { label: "View update on About" },
		});
	});
	it.each([
		"idle",
		"checking",
		"manual-only",
		"up-to-date",
		"error",
		"downloading",
		"restart-required",
	] as const)("never emits startup or repeat availability notices in %s", async (status) => {
		const state = fixture();
		state.update((value) => ({ ...value, status }));
		render(HomeNotice, {
			controller: { state },
			readyStore: writable(true),
			session: createUpdaterSession(async () => {}),
		});
		await Promise.resolve();
		expect(toast.info).not.toHaveBeenCalled();
	});
	it("waits for language readiness and announces each version once across Home remounts", async () => {
		const state = fixture();
		const readyStore = writable(false);
		const session = createUpdaterSession(async () => {});
		const props = { controller: { state }, readyStore, session };
		const view = render(HomeNotice, props);
		expect(toast.info).not.toHaveBeenCalled();
		readyStore.set(true);
		await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
		const [title, options] = vi.mocked(toast.info).mock.calls[0];
		expect(title).toBe("Update 3.7.0 is available");
		expect(options?.action).toMatchObject({ label: "View update on About" });
		if (
			!options?.action ||
			typeof options.action !== "object" ||
			!("onClick" in options.action)
		)
			throw new Error("Missing accessible action");
		const button = document.createElement("button");
		const event = new MouseEvent("click") as MouseEvent & {
			currentTarget: EventTarget & HTMLButtonElement;
		};
		Object.defineProperty(event, "currentTarget", { value: button });
		options.action.onClick(event);
		expect(goto).toHaveBeenCalledWith("/about");
		view.unmount();
		render(HomeNotice, props);
		await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
		state.update((value) => ({
			...value,
			availableUpdate: { currentVersion: "3.6.1", version: "3.8.0" },
		}));
		await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(2));
	});
});
