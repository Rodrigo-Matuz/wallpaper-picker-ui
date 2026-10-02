import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsButton from "./button.svelte";

afterEach(cleanup);

describe("SettingsButton", () => {
	it.each([
		false,
		true,
	])("uses the accent token for action hover (destructive=%s)", (destructive) => {
		render(SettingsButton, { buttonName: "ACTION", destructive, buttonOnClick: vi.fn() });
		const button = screen.getByRole("button", { name: "ACTION" });
		expect(button.classList.contains("hover:text-accent!")).toBe(true);
		expect(button.classList.contains("hover:border-accent!")).toBe(true);
		if (destructive) expect(button.classList.contains("text-accent")).toBe(true);
	});

	it("runs the supplied settings action when its button is pressed", async () => {
		const onClick = vi.fn();
		render(SettingsButton, {
			name: "Clear Thumbnails",
			shortDescription: "Remove cached previews",
			hintDescription: "Thumbnails will be regenerated",
			buttonName: "CLEAR",
			buttonOnClick: onClick,
		});
		expect(screen.getByRole("heading", { name: "Clear Thumbnails" })).toBeTruthy();
		expect(document.querySelector("summary")).not.toBeNull();
		expect(document.querySelector("[data-dialog-trigger]")).toBeNull();
		expect(screen.getByText("Remove cached previews")).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
