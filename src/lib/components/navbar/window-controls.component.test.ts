import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import WindowControls from "./window-controls.svelte";

const native = vi.hoisted(() => ({
	minimize: vi.fn(async () => {}),
	toggleMaximize: vi.fn(async () => {}),
	close: vi.fn(async () => {}),
	isMaximized: vi.fn(async () => false),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

test("titlebar controls invoke minimize, maximize and close on the current native window", async () => {
	render(WindowControls);
	await fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
	await fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
	await fireEvent.click(screen.getByRole("button", { name: "Close window" }));
	expect(native.minimize).toHaveBeenCalledTimes(1);
	expect(native.toggleMaximize).toHaveBeenCalledTimes(1);
	expect(native.close).toHaveBeenCalledTimes(1);
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Restore window" })).toBeTruthy(),
	);
});
