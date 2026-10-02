import { afterEach, describe, expect, mock, test } from "bun:test";

const check = mock(
	async (): Promise<{ version: string; downloadAndInstall: () => Promise<void> } | null> => null,
);
const relaunch = mock(async () => {});
mock.module("@tauri-apps/plugin-updater", () => ({ check }));
mock.module("@tauri-apps/plugin-process", () => ({ relaunch }));
const { checkForUpdates, getUpdateState, installUpdate } = await import("./updating");

// The module intentionally has no reset API; all tests run in one ordered state-machine sequence.
afterEach(() => {
	check.mockClear();
	relaunch.mockClear();
});

describe("updater state machine", () => {
	test("starts idle and ignores install without a pending update", async () => {
		expect(getUpdateState()).toEqual({ state: "idle", update: null, error: null });
		await installUpdate();
		expect(relaunch).not.toHaveBeenCalled();
	});
	test("no update returns to idle and permits another check", async () => {
		await checkForUpdates();
		expect(getUpdateState().state).toBe("idle");
		await checkForUpdates();
		expect(check).toHaveBeenCalledTimes(2);
	});
	test("successful check exposes update and refuses duplicate checks", async () => {
		const downloadAndInstall = mock(async () => {});
		const update = { version: "9.0.0", downloadAndInstall };
		check.mockResolvedValueOnce(update);
		await checkForUpdates();
		expect(getUpdateState()).toMatchObject({ state: "available", update, error: null });
		await checkForUpdates();
		expect(check).toHaveBeenCalledTimes(1);
		await installUpdate();
		expect(downloadAndInstall).toHaveBeenCalledTimes(1);
		expect(relaunch).toHaveBeenCalledTimes(1);
		expect(getUpdateState().state).toBe("restarting");
	});
});
