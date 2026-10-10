import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { commandDraft } from "../Input/commandDraft";
import SettingsPage from "./panel.svelte";

vi.stubGlobal("__APP_VERSION__", "test");

const { clearConfig, clearThumbnails, fetchConfig, updateConfig, toggleDarkMode } = vi.hoisted(
	() => ({
		clearConfig: vi.fn(async () => true),
		clearThumbnails: vi.fn(async () => {}),
		fetchConfig: vi.fn(async () => ({
			command: "mpvpaper $VP",
			darkMode: true,
			newWallpapers: true,
		})),
		updateConfig: vi.fn(async (_value: unknown) => true),
		toggleDarkMode: vi.fn(async () => {}),
	}),
);

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/config/clear", () => ({ clearConfig }));
vi.mock("$lib/api/thumbnails/clear", () => ({ clearThumbnails }));
vi.mock("$lib/api/config/read/read", () => ({ fetchConfig }));
vi.mock("$lib/api/config/update/update", () => ({ updateConfig }));
vi.mock("$lib/utils/darkMode", () => ({ toggleDarkMode }));

afterEach(() => {
	cleanup();
	commandDraft.discard("");
	vi.clearAllMocks();
});

describe("Settings page", () => {
	it("disables all mutation controls during installation reservation and restores them on release", async () => {
		const reservation = applicationWork.tryReserveInstall();
		expect(reservation).not.toBeNull();
		try {
			render(SettingsPage);
			await waitFor(() =>
				expect(
					(screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement).value,
				).toBe("mpvpaper $VP"),
			);
			for (const control of [
				screen.getByRole("textbox"),
				...screen.getAllByRole("switch"),
				screen.getByRole("button", { name: "Select Language" }),
				screen.getByRole("button", { name: "SAVE" }),
				screen.getByRole("button", { name: "CLEAR" }),
				screen.getByRole("button", { name: "DELETE" }),
			]) {
				expect((control as HTMLButtonElement).disabled).toBe(true);
			}
			await fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
			expect(clearThumbnails).not.toHaveBeenCalled();
			reservation?.release();
			await waitFor(() =>
				expect(
					(screen.getByRole("button", { name: "CLEAR" }) as HTMLButtonElement).disabled,
				).toBe(false),
			);
		} finally {
			reservation?.release();
		}
	});
	it("config deletion does not discard the command draft or claim a confirmed reset", async () => {
		const view = render(SettingsPage);
		const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
		await waitFor(() => expect(field.value).toBe("mpvpaper $VP"));
		await fireEvent.input(field, { target: { value: "unsaved draft" } });
		expect(applicationWork.hasDirtyInputs()).toBe(true);
		await fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
		expect(clearConfig).toHaveBeenCalledTimes(1);
		expect(field.value).toBe("unsaved draft");
		expect(applicationWork.hasDirtyInputs()).toBe(true);
		view.unmount();
		expect(applicationWork.hasDirtyInputs()).toBe(true);
	});
	it("groups all six settings under labelled sections with a working section index", async () => {
		render(SettingsPage);
		expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
		const index = screen.getByRole("navigation", { name: "Settings sections" });
		const sections = ["Wallpaper", "Preferences", "Maintenance"];
		for (const name of sections) {
			const link = within(index).getByRole("link", { name });
			const id = link.getAttribute("href")?.slice(1);
			const section = screen.getByRole("region", { name });
			expect(section.id).toBe(id);
		}
		expect(document.querySelectorAll('[data-slot="settings-row"]').length).toBe(6);
		expect(document.querySelectorAll('[data-slot="card"]').length).toBe(0);
		const command = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
		await waitFor(() => expect(command.value).toBe("mpvpaper $VP"));
	});

	it("keeps maintenance actions and both toggles wired to the existing APIs", async () => {
		render(SettingsPage);
		await fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
		await fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
		expect(clearThumbnails).toHaveBeenCalledTimes(1);
		expect(clearConfig).toHaveBeenCalledTimes(1);
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: "New Wallpapers" }).getAttribute("aria-checked"),
			).toBe("true"),
		);
		await fireEvent.click(screen.getByRole("switch", { name: "New Wallpapers" }));
		expect(updateConfig).toHaveBeenCalledWith({ newWallpapers: false });
		await fireEvent.click(screen.getByRole("switch", { name: "Dark Mode" }));
		expect(toggleDarkMode).toHaveBeenCalledTimes(1);
	});
});
