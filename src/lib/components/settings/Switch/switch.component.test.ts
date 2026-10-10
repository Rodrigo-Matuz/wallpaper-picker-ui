import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsSwitch from "./switch.svelte";

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: errorToast } }));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("reports rejected initial switch reads without floating a UI rejection", async () => {
	render(SettingsSwitch, {
		name: "Dark Mode",
		fetchValue: async () => {
			throw new Error("read denied");
		},
		onToggle: async () => {},
	});
	await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
});

it("restores the persisted switch value after a reported failure", async () => {
	render(SettingsSwitch, {
		name: "New Wallpapers",
		fetchValue: async () => false,
		onToggle: async () => false,
	});
	const toggle = screen.getByRole("switch", { name: "New Wallpapers" });
	await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
	await fireEvent.click(toggle);
	await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
});

describe("SettingsSwitch", () => {
	it("loads the saved value and persists subsequent toggles", async () => {
		const fetchValue = vi.fn().mockResolvedValue(false);
		const onToggle = vi.fn().mockResolvedValue(undefined);
		render(SettingsSwitch, {
			name: "Dark Mode",
			shortDescription: "Use dark colors",
			hintDescription: "Choose your theme",
			fetchValue,
			onToggle,
		});
		const toggle = screen.getByRole("switch", { name: "Dark Mode" });
		expect(screen.getByRole("heading", { name: "Dark Mode" })).toBeTruthy();
		expect(document.querySelector("[data-dialog-trigger]")).toBeNull();
		await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
		expect(fetchValue).toHaveBeenCalledTimes(1);
		await fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		expect(onToggle).toHaveBeenCalledExactlyOnceWith(true);
	});
});
