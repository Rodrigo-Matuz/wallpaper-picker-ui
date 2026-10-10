import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdaterController } from "$utils/updating/controller/controller";
import GlobalUpdater from "./global-updater.svelte";

vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
afterEach(cleanup);

describe("Global updater status and admission UI (synthetic state)", () => {
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
