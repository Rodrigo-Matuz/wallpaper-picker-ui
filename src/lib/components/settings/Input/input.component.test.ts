import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsInput from "./input.svelte";

const { fetchConfig, updateConfig, log } = vi.hoisted(() => ({
	fetchConfig: vi.fn(async () => ({ command: "mpvpaper $VP" })),
	updateConfig: vi.fn(async (_config: { command: string }) => {}),
	log: vi.fn(async (_message: unknown) => {}),
}));
vi.mock("$lib/api/config/read/read", () => ({ fetchConfig }));
vi.mock("$lib/api/config/update/update", () => ({ updateConfig }));
vi.mock("$lib/utils/logger/logger", () => ({ log }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("SettingsInput", () => {
	it("loads the current command and persists the edited value", async () => {
		render(SettingsInput, {
			name: "Command",
			shortDescription: "Wallpaper command",
			hintDescription: "Enter a command",
			inputPlaceholder: "Enter command",
		});
		await waitFor(() => expect(fetchConfig).toHaveBeenCalledTimes(1));
		const trigger = document.querySelector("[data-dialog-trigger]");
		if (!trigger) throw new Error("Settings dialog trigger is missing");
		await fireEvent.click(trigger);
		const field = (await screen.findByPlaceholderText("Enter command")) as HTMLInputElement;
		expect(field.value).toBe("mpvpaper $VP");
		await fireEvent.input(field, { target: { value: "new-wallpaper $VP" } });
		await fireEvent.click(screen.getByRole("button", { name: "Command" }));
		expect(updateConfig).toHaveBeenCalledExactlyOnceWith({ command: "new-wallpaper $VP" });
		expect(log).not.toHaveBeenCalled();
	});
});
