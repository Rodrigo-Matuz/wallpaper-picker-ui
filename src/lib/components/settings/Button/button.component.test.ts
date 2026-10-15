import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsButton from "./button.svelte";

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: errorToast } }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("reports a settings action's false persistence result", async () => {
	render(SettingsButton, { buttonName: "DELETE", buttonOnClick: async () => false });
	await fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
	expect(errorToast).toHaveBeenCalledTimes(1);
});

describe("SettingsButton", () => {
	it.each([
		false,
		true,
	])("uses the danger token for destructive action hover (destructive=%s)", (destructive) => {
		render(SettingsButton, { buttonName: "ACTION", destructive, buttonOnClick: vi.fn() });
		const button = screen.getByRole("button", { name: "ACTION" });
		if (destructive) {
			expect(button.classList.contains("text-warning")).toBe(true);
			expect(button.classList.contains("hover:text-warning!")).toBe(true);
			expect(button.classList.contains("hover:border-warning!")).toBe(true);
			expect(button.classList.contains("hover:bg-warning/10")).toBe(true);
		} else {
			expect(button.classList.contains("hover:text-accent!")).toBe(true);
			expect(button.classList.contains("hover:border-accent!")).toBe(true);
		}
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
