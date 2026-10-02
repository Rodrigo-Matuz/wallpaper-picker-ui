import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLanguage } from "$lang/index";
import SettingsSelector from "./selector.svelte";

vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn(async () => {}) }));

afterEach(() => {
	cleanup();
	currentLanguage.set("eng");
});

describe("SettingsSelector", () => {
	it("labels the selector and displays the current language without a new selection", async () => {
		currentLanguage.set("pt-br");
		render(SettingsSelector, {
			name: "Language",
			shortDescription: "Choose the application language",
			hintDescription: "Help translate the application",
			selectorPlaceholder: "Choose a language",
		});
		const selector = screen.getByRole("button", { name: "Language" });
		expect(selector.textContent).toContain("Português Brasileiro");
		currentLanguage.set("de");
		await waitFor(() => expect(selector.textContent).toContain("Deutsch"));
		expect(document.querySelector("[data-dialog-trigger]")).toBeNull();
	});
});
