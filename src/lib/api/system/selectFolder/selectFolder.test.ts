import { afterEach, describe, expect, mock, test } from "bun:test";
import { writable } from "svelte/store";
import { applicationWork } from "$utils/applicationWork/applicationWork";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("folder dialog owns work before opening through persistence and blocks reservation", async () => {
	const dialog = deferred<string | null>();
	const saving = deferred<boolean>();
	const saveStarted = deferred<void>();
	open.mockImplementationOnce(() => dialog.promise);
	updateConfig.mockImplementationOnce(() => {
		saveStarted.resolve();
		return saving.promise;
	});
	const operation = selectFolder();
	try {
		expect(applicationWork.getSnapshot().pendingWork).toBe(1);
		expect(applicationWork.tryReserveInstall()).toBeNull();
		dialog.resolve("/videos");
		await saveStarted.promise;
		expect(applicationWork.tryReserveInstall()).toBeNull();
		saving.resolve(true);
		expect(await operation).toBe("/videos");
		expect(applicationWork.hasPendingWork()).toBe(false);
	} finally {
		dialog.resolve(null);
		saving.resolve(false);
		await operation;
	}
});

const open = mock(async (_options: object): Promise<string | null> => "/videos");
const updateConfig = mock(async (_config: object) => true);
const log = mock(async () => {});
const errorToast = mock((_message: string) => {});
mock.module("svelte-sonner", () => ({ toast: { error: errorToast } }));
mock.module("@tauri-apps/plugin-dialog", () => ({ open }));
mock.module("$api/config/update/update", () => ({ updateConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("$lang/index", () => ({ t: writable((key: string) => key) }));
const { selectFolder } = await import("./selectFolder");

afterEach(() => {
	open.mockReset();
	open.mockImplementation(async () => "/videos");
	updateConfig.mockReset();
	updateConfig.mockImplementation(async () => true);
	log.mockClear();
	errorToast.mockClear();
});

describe("selectFolder", () => {
	test("denied reservation reports failure without opening a dialog or leaking logger rejection", async () => {
		const reservation = applicationWork.tryReserveInstall();
		expect(reservation).not.toBeNull();
		log.mockRejectedValueOnce(new Error("logger unavailable"));
		try {
			expect(await selectFolder()).toBe("");
			expect(open).not.toHaveBeenCalled();
			expect(errorToast).toHaveBeenCalledWith("toast.folder.failed");
		} finally {
			reservation?.release();
			log.mockReset();
			log.mockImplementation(async () => {});
		}
	});
	test("reported persistence failure does not claim a selected folder", async () => {
		updateConfig.mockResolvedValueOnce(false);
		expect(await selectFolder()).toBe("");
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
	test("opens directory picker with translated title and persists selection", async () => {
		expect(await selectFolder()).toBe("/videos");
		expect(open).toHaveBeenCalledWith({ directory: true, title: "home.folder.dialog.title" });
		expect(updateConfig).toHaveBeenCalledWith({ wallpapersPath: "/videos" });
	});
	test("cancel leaves stored folder unchanged", async () => {
		open.mockResolvedValueOnce(null);
		expect(await selectFolder()).toBe("");
		expect(updateConfig).not.toHaveBeenCalled();
	});
	test("dialog failure returns empty string and logs error", async () => {
		open.mockRejectedValueOnce(new Error("dialog unavailable"));
		expect(await selectFolder()).toBe("");
		expect(updateConfig).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
	test("config write failure returns empty string rather than reporting selection", async () => {
		updateConfig.mockRejectedValueOnce(new Error("disk full"));
		expect(await selectFolder()).toBe("");
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
});
