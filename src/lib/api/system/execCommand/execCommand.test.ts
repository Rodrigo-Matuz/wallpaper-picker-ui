import { afterEach, describe, expect, mock, test } from "bun:test";
import { writable } from "svelte/store";

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
