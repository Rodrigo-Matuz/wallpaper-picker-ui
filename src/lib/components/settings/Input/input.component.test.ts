import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { commandDraft } from "./commandDraft";
import SettingsInput from "./input.svelte";

const { fetchConfig, updateConfig, log } = vi.hoisted(() => ({
	fetchConfig: vi.fn(async () => ({ command: "mpvpaper $VP" })),
	updateConfig: vi.fn(async (_config: { command: string }) => true),
	log: vi.fn(async (_message: unknown) => {}),
}));
vi.mock("$lib/api/config/read/read", () => ({ fetchConfig }));
vi.mock("$lib/api/config/update/update", () => ({ updateConfig }));
vi.mock("$lib/utils/logger/logger", () => ({ log }));
const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: errorToast } }));

afterEach(() => {
	cleanup();
	commandDraft.discard("");
	expect(applicationWork.hasDirtyInputs()).toBe(false);
	vi.clearAllMocks();
});

describe("SettingsInput", () => {
	it("reports rejected initial reads without floating a UI rejection", async () => {
		fetchConfig.mockRejectedValueOnce(new Error("read denied"));
		render(SettingsInput, { name: "Command" });
		await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
	});
	it("denies synthetic typing while reserved without losing the displayed saved value", async () => {
		const reservation = applicationWork.tryReserveInstall();
		expect(reservation).not.toBeNull();
		try {
			render(SettingsInput, { name: "Command" });
			const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
			await waitFor(() => expect(field.value).toBe("mpvpaper $VP"));
			await fireEvent.input(field, { target: { value: "denied edit" } });
			expect(field.value).toBe("mpvpaper $VP");
			expect(applicationWork.hasDirtyInputs()).toBe(false);
			expect(errorToast).toHaveBeenCalledTimes(1);
		} finally {
			reservation?.release();
		}
	});
	it("denies synthetic submission while installation is reserved", async () => {
		const reservation = applicationWork.tryReserveInstall();
		expect(reservation).not.toBeNull();
		try {
			render(SettingsInput, { name: "Command" });
			const form = document.querySelector("form");
			expect(form).not.toBeNull();
			if (form) await fireEvent.submit(form);
			expect(updateConfig).not.toHaveBeenCalled();
			expect(errorToast).toHaveBeenCalledTimes(1);
		} finally {
			reservation?.release();
		}
	});
	it("ignores a late initial config read after editing and saving", async () => {
		let resolve!: (config: { command: string }) => void;
		const reading = new Promise<{ command: string }>((done) => {
			resolve = done;
		});
		fetchConfig.mockImplementationOnce(() => reading);
		render(SettingsInput, { name: "Command" });
		try {
			const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
			await fireEvent.input(field, { target: { value: "new command" } });
			await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
			await waitFor(() => expect(applicationWork.hasDirtyInputs()).toBe(false));
			resolve({ command: "old command" });
			await reading;
			await tick();
			await waitFor(() => expect(field.value).toBe("new command"));
		} finally {
			resolve({ command: "old command" });
		}
	});
	it("keeps the edited command and its dirty owner across unmount until confirmed save", async () => {
		const first = render(SettingsInput, { name: "Command" });
		const field = screen.getByRole("textbox", { name: "Command" });
		await waitFor(() => expect((field as HTMLInputElement).value).toBe("mpvpaper $VP"));
		await fireEvent.input(field, { target: { value: "edited" } });
		await fireEvent.input(field, { target: { value: "edited again" } });
		first.unmount();
		expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
		expect(updateConfig).not.toHaveBeenCalled();
		render(SettingsInput, { name: "Command" });
		await waitFor(() =>
			expect(
				(screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement).value,
			).toBe("edited again"),
		);
		await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
		await waitFor(() => expect(applicationWork.hasDirtyInputs()).toBe(false));
		expect(updateConfig).toHaveBeenCalledExactlyOnceWith({ command: "edited again" });
	});
	it("retains the edited command after a reported persistence failure", async () => {
		updateConfig.mockResolvedValueOnce(false);
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
		expect(errorToast).toHaveBeenCalledTimes(1);
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
