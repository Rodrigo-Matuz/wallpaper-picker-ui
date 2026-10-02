import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "./navbar.svelte";

afterEach(cleanup);

describe("Navbar", () => {
	it("reserves square, padding-free controls for both icons", () => {
		render(Navbar);
		for (const button of screen.getAllByRole("button")) {
			expect(button.classList.contains("size-9")).toBe(true);
			// Override the shared text button's horizontal padding.
			expect(button.classList.contains("p-0!")).toBe(true);
			const icon = button.querySelector("svg");
			expect(icon).not.toBeNull();
			expect(icon?.classList.contains("size-5")).toBe(true);
			expect(icon?.classList.contains("shrink-0")).toBe(true);
		}
	});

	it("uses matching borderless, transparent controls with success-colored hover", () => {
		render(Navbar);
		for (const button of screen.getAllByRole("button")) {
			expect(button.classList.contains("border-0")).toBe(true);
			expect(button.classList.contains("hover:bg-transparent!")).toBe(true);
			expect(button.classList.contains("hover:text-success!")).toBe(true);
		}
	});

	it("forwards both action clicks and enabled search input", async () => {
		const leftOnClick = vi.fn();
		const rightOnClick = vi.fn();
		const onInputChange = vi.fn();
		render(Navbar, {
			leftOnClick,
			rightOnClick,
			onInputChange,
			disableInput: false,
			inputPlaceholder: "Search wallpapers",
		});
		const [left, right] = screen.getAllByRole("button");
		await fireEvent.click(left);
		await fireEvent.click(right);
		expect(leftOnClick).toHaveBeenCalledTimes(1);
		expect(rightOnClick).toHaveBeenCalledTimes(1);

		const search = screen.getByPlaceholderText("Search wallpapers") as HTMLInputElement;
		expect(search.disabled).toBe(false);
		await fireEvent.input(search, { target: { value: "forest" } });
		expect(onInputChange).toHaveBeenCalledTimes(1);
		expect((onInputChange.mock.calls[0][0] as Event).target).toBe(search);
		expect(search.value).toBe("forest");
	});

	it("defaults search to disabled and omits it when hidden", async () => {
		const view = render(Navbar, { inputPlaceholder: "Find video" });
		expect((screen.getByPlaceholderText("Find video") as HTMLInputElement).disabled).toBe(true);
		await view.rerender({ inputPlaceholder: "Find video", showInput: false });
		expect(screen.queryByPlaceholderText("Find video")).toBeNull();
	});
});
