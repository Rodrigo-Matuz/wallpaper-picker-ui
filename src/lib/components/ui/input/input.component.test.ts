import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Input from "./input.svelte";

afterEach(cleanup);

describe("Input", () => {
	it("updates its value and forwards input events", async () => {
		const oninput = vi.fn();
		const view = render(Input, { placeholder: "Command", value: "initial", oninput });
		const input = screen.getByPlaceholderText("Command") as HTMLInputElement;
		expect(input.value).toBe("initial");

		await fireEvent.input(input, { target: { value: "updated command" } });
		expect(input.value).toBe("updated command");
		expect(oninput).toHaveBeenCalledTimes(1);

		await view.rerender({ placeholder: "Command", value: "from parent", oninput });
		expect(input.value).toBe("from parent");
	});

	it("renders an inaccessible-to-typing disabled input", () => {
		render(Input, { "aria-label": "Disabled command", disabled: true });
		const input = screen.getByRole("textbox", { name: "Disabled command" }) as HTMLInputElement;
		expect(input.disabled).toBe(true);
		expect(input.getAttribute("data-slot")).toBe("input");
	});
});
