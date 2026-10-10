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

test("command ownership spans lookup, native settlement and final diagnostics", async () => {
	const lookup = deferred<{ command: string }>();
	const native = deferred<string>();
	const invoked = deferred<void>();
	const diagnostics = deferred<void>();
	const logged = deferred<void>();
	fetchConfig.mockImplementationOnce(() => lookup.promise);
	invoke.mockImplementationOnce(() => {
		invoked.resolve();
		return native.promise;
	});
	log.mockImplementationOnce(() => {
		logged.resolve();
		return diagnostics.promise;
	});
	const operation = sendCommand("/videos/a.mp4");
	try {
		expect(applicationWork.tryReserveInstall()).toBeNull();
		lookup.resolve({ command: "user shell $VP" });
		await invoked.promise;
		expect(applicationWork.tryReserveInstall()).toBeNull();
		native.resolve("ok");
		await logged.promise;
		expect(applicationWork.getSnapshot().pendingWork).toBe(1);
		diagnostics.resolve();
		await operation;
		expect(applicationWork.hasPendingWork()).toBe(false);
	} finally {
		lookup.resolve({ command: "" });
		native.resolve("ok");
		diagnostics.resolve();
		await operation;
	}
});

test("installation reservation denies command admission with existing translated failure", async () => {
	const reservation = applicationWork.tryReserveInstall();
	expect(reservation).not.toBeNull();
	log.mockRejectedValueOnce(new Error("logger unavailable"));
	try {
		await sendCommand("/videos/a.mp4");
		expect(fetchConfig).not.toHaveBeenCalled();
		expect(invoke).not.toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledWith("toast.command.failed");
	} finally {
		reservation?.release();
		log.mockReset();
		log.mockImplementation(async () => {});
	}
});

const invoke = mock(async (_command: string, _args: object) => "ok");
const fetchConfig = mock(async () => ({ command: "mpv $VP" }));
const log = mock(async () => {});
const warning = mock((_message: string) => {});
const errorToast = mock((_message: string) => {});
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("$api/config/read/read", () => ({ fetchConfig }));
mock.module("$utils/logger/logger", () => ({ log }));
mock.module("$lang/index", () => ({ t: writable((key: string) => key) }));
mock.module("svelte-sonner", () => ({ toast: { warning, error: errorToast } }));
const { sendCommand } = await import("./execCommand");

afterEach(() => {
	invoke.mockReset();
	invoke.mockImplementation(async () => "ok");
	fetchConfig.mockReset();
	fetchConfig.mockImplementation(async () => ({ command: "mpv $VP" }));
	log.mockClear();
	warning.mockClear();
	errorToast.mockClear();
});

describe("sendCommand", () => {
	test("passes configured command and selected video to backend", async () => {
		await sendCommand("/videos/space clip.mp4");
		expect(invoke).toHaveBeenCalledWith("send_command", {
			command: "mpv $VP",
			path: "/videos/space clip.mp4",
		});
		expect(warning).not.toHaveBeenCalled();
		expect(errorToast).not.toHaveBeenCalled();
	});
	test("blank commands warn without executing", async () => {
		fetchConfig.mockResolvedValueOnce({ command: "   " });
		await sendCommand("/videos/a.mp4");
		expect(invoke).not.toHaveBeenCalled();
		expect(warning).toHaveBeenCalledWith("toast.command.none");
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
	});
	test("backend failure shows an error toast and logs it", async () => {
		invoke.mockRejectedValueOnce(new Error("shell unavailable"));
		await sendCommand("/videos/a.mp4");
		expect(errorToast).toHaveBeenCalledWith("toast.command.failed");
		expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
	});
});
