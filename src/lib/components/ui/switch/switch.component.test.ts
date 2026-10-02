import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Switch from "./switch.svelte";

afterEach(cleanup);

describe("Switch", () => {
	it("reports each user toggle and updates its checked state", async () => {
		const onCheckedChange = vi.fn();
		render(Switch, { "aria-label": "Dark mode", checked: false, onCheckedChange });
		const toggle = screen.getByRole("switch", { name: "Dark mode" });
		expect(toggle.getAttribute("aria-checked")).toBe("false");

		await fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		expect(onCheckedChange).toHaveBeenCalledWith(true);

		await fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		expect(onCheckedChange).toHaveBeenCalledWith(false);
	});

	it("does not toggle when disabled", async () => {
		const onCheckedChange = vi.fn();
		render(Switch, { "aria-label": "Locked", checked: false, disabled: true, onCheckedChange });
		const toggle = screen.getByRole("switch", { name: "Locked" }) as HTMLButtonElement;
		expect(toggle.disabled).toBe(true);
		toggle.click();
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		expect(onCheckedChange).not.toHaveBeenCalled();
	});
});
