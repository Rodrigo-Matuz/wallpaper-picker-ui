import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Button from "./button.svelte";

const label = createRawSnippet(() => ({ render: () => "<span>Apply</span>" }));

afterEach(cleanup);

describe("Button", () => {
	it("calls its click handler for an enabled button but not a disabled one", async () => {
		const onClick = vi.fn();
		const view = render(Button, { children: label, onclick: onClick });
		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(onClick).toHaveBeenCalledTimes(1);

		await view.rerender({ children: label, onclick: onClick, disabled: true });
		const button = screen.getByRole("button", { name: "Apply" });
		expect(button.hasAttribute("disabled")).toBe(true);
		button.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("removes navigation and focus from disabled links", async () => {
		const onClick = vi.fn();
		const view = render(Button, { children: label, href: "#about", onclick: onClick });
		const link = screen.getByRole("link", { name: "Apply" });
		expect(link.getAttribute("href")).toBe("#about");
		await fireEvent.click(link);
		expect(onClick).toHaveBeenCalledTimes(1);

		await view.rerender({ children: label, href: "#about", onclick: onClick, disabled: true });
		const disabledLink = screen.getByRole("link", { name: "Apply" });
		expect(disabledLink.hasAttribute("href")).toBe(false);
		expect(disabledLink.getAttribute("aria-disabled")).toBe("true");
		expect(disabledLink.getAttribute("tabindex")).toBe("-1");
	});
});
