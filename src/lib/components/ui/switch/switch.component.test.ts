import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Switch from "./switch.svelte";

afterEach(cleanup);

describe("Switch", () => {
	it("defines circular track and thumb with explicit padded endpoints", () => {
		render(Switch, { "aria-label": "Geometry" });
		const track = screen.getByRole("switch", { name: "Geometry" });
		const thumb = track.querySelector('[data-slot="switch-thumb"]');
		expect(track.classList.contains("rounded-full")).toBe(true);
		expect(track.classList.contains("h-6")).toBe(true);
		expect(track.classList.contains("p-0.5")).toBe(true);
		expect(thumb?.classList.contains("rounded-full")).toBe(true);
		expect(thumb?.classList.contains("data-[state=checked]:translate-x-4")).toBe(true);
		expect(thumb?.classList.contains("duration-150")).toBe(true);
		expect(thumb?.classList.contains("motion-reduce:transition-none")).toBe(true);
	});

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
