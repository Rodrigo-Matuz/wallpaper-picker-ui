import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApplicationSession } from "$utils/updating/session/runtime";
import Layout from "./+layout.svelte";

vi.hoisted(() => {
	vi.stubGlobal("localStorage", {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
	});
});
vi.mock("$utils/updating/session/runtime", () => ({
	initializeApplicationSession: vi.fn(async () => {}),
	runtimeMode: writable(null),
	languageReady: writable(true),
}));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));
beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("root updater integration", () => {
	it("initializes after mounting and wraps all route content in the reservation gate", async () => {
		const children = createRawSnippet(() => ({
			render: () => '<div><button type="button">Route action</button></div>',
		}));
		render(Layout, { children });
		await waitFor(() => expect(initializeApplicationSession).toHaveBeenCalledTimes(1));
		expect(
			screen
				.getByRole("button", { name: "Route action" })
				.closest("[data-installation-gate]"),
		).toBeTruthy();
	});
});
