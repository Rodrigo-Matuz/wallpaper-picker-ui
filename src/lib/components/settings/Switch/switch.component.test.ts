import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsSwitch from "./switch.svelte";

afterEach(cleanup);

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
		const toggle = screen.getByRole("switch");
		await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
		expect(fetchValue).toHaveBeenCalledTimes(1);
		await fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		expect(onToggle).toHaveBeenCalledExactlyOnceWith(true);
	});
});
