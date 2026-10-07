import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationWork } from "$utils/applicationWork/applicationWork";
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
	expect(applicationWork.hasDirtyInputs()).toBe(false);
	vi.clearAllMocks();
});

describe("SettingsInput", () => {
	it("tracks typing once per component and releases only its own dirty token on unmount", async () => {
		const first = render(SettingsInput, { name: "First command" });
		const second = render(SettingsInput, { name: "Second command" });
		const firstField = screen.getByRole("textbox", { name: "First command" });
		const secondField = screen.getByRole("textbox", { name: "Second command" });
		await waitFor(() => expect((firstField as HTMLInputElement).value).toBe("mpvpaper $VP"));
		expect(applicationWork.hasDirtyInputs()).toBe(false);
		await fireEvent.input(firstField, { target: { value: "edited" } });
		await fireEvent.input(firstField, { target: { value: "edited again" } });
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
		await fireEvent.input(secondField, { target: { value: "other edited" } });
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(2);
		first.unmount();
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
		second.unmount();
		expect(applicationWork.hasDirtyInputs()).toBe(false);
		expect(updateConfig).not.toHaveBeenCalled();
	});
	it("submits the edited command but retains dirty state because void resolution is not persistence proof", async () => {
		render(SettingsInput, {
			name: "Command",
			shortDescription: "Wallpaper command",
			hintDescription: "Enter a command",
			inputPlaceholder: "Enter command",
		});
		await waitFor(() => expect(fetchConfig).toHaveBeenCalledTimes(1));
		const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
		expect(document.querySelector("[data-dialog-trigger]")).toBeNull();
		expect(field.value).toBe("mpvpaper $VP");
		await fireEvent.input(field, { target: { value: "new-wallpaper $VP" } });
		await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
		expect(updateConfig).toHaveBeenCalledExactlyOnceWith({ command: "new-wallpaper $VP" });
		expect(log).not.toHaveBeenCalled();
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
	});

	it("retains dirty state after a rejected save without changing existing error logging", async () => {
		render(SettingsInput, { name: "Command" });
		const field = screen.getByRole("textbox", { name: "Command" });
		await waitFor(() => expect((field as HTMLInputElement).value).toBe("mpvpaper $VP"));
		await fireEvent.input(field, { target: { value: "unsaved" } });
		updateConfig.mockRejectedValueOnce(new Error("save denied"));
		await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
		await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
	});
});
