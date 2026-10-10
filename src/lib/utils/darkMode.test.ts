import { afterEach, expect, mock, test } from "bun:test";
import { writable } from "svelte/store";
import { applicationWork } from "$utils/applicationWork/applicationWork";

const fetchConfig = mock(async () => ({ darkMode: true }));
const updateConfig = mock(async (_config: object) => true);
const setMode = mock((_mode: string) => {});
const log = mock(async () => {});
const errorToast = mock((_message: string) => {});
mock.module("$api/config/read/read", () => ({ fetchConfig }));
mock.module("$api/config/update/update", () => ({ updateConfig }));
mock.module("mode-watcher", () => ({ setMode }));
mock.module("./logger/logger", () => ({ log }));
mock.module("$lang/index", () => ({ t: writable((key: string) => key) }));
mock.module("svelte-sonner", () => ({ toast: { error: errorToast } }));
const { toggleDarkMode } = await import("./darkMode");
afterEach(() => {
	for (const fn of [fetchConfig, updateConfig, setMode, log, errorToast]) fn.mockClear();
});

test("reported dark-mode persistence failure leaves the existing theme unchanged", async () => {
	updateConfig.mockResolvedValueOnce(false);
	expect(await toggleDarkMode()).toBe(false);
	expect(setMode).not.toHaveBeenCalled();
	expect(errorToast).toHaveBeenCalledWith("toast.settings.failed");
	await toggleDarkMode();
	expect(setMode).toHaveBeenCalledWith("light");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

test("reserved installation denies dark-mode work before config lookup or theme publication", async () => {
	const reservation = applicationWork.tryReserveInstall();
	expect(reservation).not.toBeNull();
	log.mockRejectedValueOnce(new Error("logger unavailable"));
	try {
		await toggleDarkMode();
		expect(fetchConfig).not.toHaveBeenCalled();
		expect(updateConfig).not.toHaveBeenCalled();
		expect(setMode).not.toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledTimes(1);
	} finally {
		reservation?.release();
		log.mockReset();
		log.mockImplementation(async () => {});
	}
});
