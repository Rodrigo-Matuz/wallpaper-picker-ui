import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { get } from "svelte/store";
import { defaultConfig } from "$api/config/defaults";
import { CONFIG_FILE_PATH } from "$utils/paths";

let stored = "{corrupt";
const exists = mock(async (path: string) => path !== CONFIG_FILE_PATH || Boolean(stored));
const mkdir = mock(async () => {});
const readTextFile = mock(async () => stored);
const writeFile = mock(async (_path: string, bytes: Uint8Array) => {
	stored = new TextDecoder().decode(bytes);
});
const remove = mock(async () => {
	stored = "";
});
const invoke = mock(async (_command: string, _args: unknown) => {});
mock.module("@tauri-apps/plugin-fs", () => ({
	BaseDirectory: { Config: 13 },
	exists,
	mkdir,
	readTextFile,
	writeFile,
	remove,
}));
mock.module("@tauri-apps/api/core", () => ({ invoke }));
const { fetchConfig, clearConfigCache, peekConfig } = await import("./read");
const { updateConfig } = await import("../update/update");
const { clearConfig } = await import("../clear");
const { log } = await import("$utils/logger/logger");
const { commandDraft } = await import("$components/settings/Input/commandDraft");
const { applicationWork } = await import("$utils/applicationWork/applicationWork");

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

beforeEach(() => {
	stored = "{corrupt";
	clearConfigCache();
	commandDraft.discard("initial");
	writeFile.mockImplementation(async (_path, bytes) => {
		stored = new TextDecoder().decode(bytes);
	});
});
afterEach(() => {
	commandDraft.discard("");
	clearConfigCache();
	for (const fn of [exists, mkdir, readTextFile, writeFile, remove, invoke]) fn.mockClear();
});

test("cold SAVE repairs within its queue owner and real diagnostics settle before acknowledgement", async () => {
	commandDraft.edit("retained");
	const saved = commandDraft.capture();
	const repairStarted = deferred();
	const repairWrite = deferred();
	const logStarted = deferred();
	const logging = deferred();
	writeFile.mockImplementationOnce(async (_path, bytes) => {
		repairStarted.resolve();
		await repairWrite.promise;
		stored = new TextDecoder().decode(bytes);
	});
	invoke.mockImplementationOnce(async () => {
		logStarted.resolve();
		await logging.promise;
	});
	const saving = updateConfig({ command: saved.value, debugMode: true }).then((persisted) => {
		if (persisted) commandDraft.confirmSaved(saved);
		return persisted;
	});
	let reading: Promise<unknown> | undefined;
	try {
		await repairStarted.promise;
		expect(peekConfig()).toBeNull();
		expect(get(commandDraft.state).dirty).toBe(true);
		let readSettled = false;
		reading = fetchConfig().then(() => {
			readSettled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(readSettled).toBe(false);
		expect(writeFile).toHaveBeenCalledTimes(1);
		repairWrite.resolve();
		await logStarted.promise;
		expect(JSON.parse(stored).command).toBe("retained");
		expect(get(commandDraft.state).dirty).toBe(true);
		expect(applicationWork.tryReserveInstall()).toBeNull();
		logging.resolve();
		expect(await saving).toBe(true);
		await reading;
		expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: false });
		expect(readTextFile).toHaveBeenCalledTimes(1);
		expect(invoke).toHaveBeenCalledWith(
			"log_message",
			expect.objectContaining({
				level: "positive",
				message: expect.stringContaining("Configuration updated successfully"),
			}),
		);
	} finally {
		repairWrite.resolve();
		logging.resolve();
		await Promise.all([saving, reading]);
	}
});

test("ordinary real logger read waits for recovery instead of joining its own diagnostics", async () => {
	const repairStarted = deferred();
	const repairWrite = deferred();
	writeFile.mockImplementationOnce(async (_path, bytes) => {
		repairStarted.resolve();
		await repairWrite.promise;
		stored = new TextDecoder().decode(bytes);
	});
	const reading = fetchConfig();
	let diagnostic: Promise<void> | undefined;
	let logged = false;
	try {
		await repairStarted.promise;
		diagnostic = log({ message: "ordinary caller", callStack: new Error() }).then(() => {
			logged = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(logged).toBe(false);
		expect(peekConfig()).toBeNull();
		repairWrite.resolve();
		expect(await reading).toEqual(defaultConfig);
		await diagnostic;
		expect(readTextFile).toHaveBeenCalledTimes(1);
		expect(writeFile).toHaveBeenCalledTimes(1);
		expect(invoke).not.toHaveBeenCalled(); // Production defaults disable debug logging.
	} finally {
		repairWrite.resolve();
		await Promise.all([reading, diagnostic]);
	}
});

test("failed repair returns uncached defaults only after settlement and competing readers retry", async () => {
	const repairStarted = deferred();
	const repairWrite = deferred();
	writeFile.mockImplementationOnce(async () => {
		repairStarted.resolve();
		await repairWrite.promise;
		throw new Error("disk full");
	});
	const reading = fetchConfig();
	let competing: Promise<unknown> | undefined;
	try {
		await repairStarted.promise;
		let competingSettled = false;
		competing = fetchConfig().then((config) => {
			competingSettled = true;
			return config;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(competingSettled).toBe(false);
		expect(peekConfig()).toBeNull();
		repairWrite.resolve();
		expect(await reading).toEqual(defaultConfig);
		expect(await competing).toEqual(defaultConfig);
		expect(readTextFile).toHaveBeenCalledTimes(2);
		expect(writeFile).toHaveBeenCalledTimes(2);
		expect(peekConfig()).toEqual(defaultConfig);
		expect(JSON.parse(stored)).toEqual(defaultConfig);
		expect(applicationWork.hasPendingWork()).toBe(false);
	} finally {
		repairWrite.resolve();
		await Promise.all([reading, competing]);
	}
});

test("recovery followed by SAVE DELETE SAVE preserves mutation order and reset identity", async () => {
	const repairStarted = deferred();
	const repairWrite = deferred();
	writeFile.mockImplementationOnce(async (_path, bytes) => {
		repairStarted.resolve();
		await repairWrite.promise;
		stored = new TextDecoder().decode(bytes);
	});
	commandDraft.edit("retained");
	const saved = commandDraft.capture();
	const reading = fetchConfig();
	let first: Promise<boolean> | undefined;
	let deleting: Promise<boolean> | undefined;
	let last: Promise<boolean> | undefined;
	try {
		await repairStarted.promise;
		first = updateConfig({ command: "first" });
		deleting = clearConfig();
		last = updateConfig({ command: saved.value });
		repairWrite.resolve();
		expect(await first).toBe(true);
		expect(await deleting).toBe(true);
		expect(await last).toBe(true);
		await reading;
		commandDraft.confirmSaved(saved);
		expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: true });
		expect((await fetchConfig()).command).toBe("retained");
		expect(JSON.parse(stored).command).toBe("retained");
		expect(
			writeFile.mock.calls.map(
				(call) => JSON.parse(new TextDecoder().decode(call[1])).command,
			),
		).toEqual(["", "first", "", "retained"]);
		expect(remove).toHaveBeenCalledTimes(1);
		expect(applicationWork.hasPendingWork()).toBe(false);
		expect(applicationWork.tryReserveInstall()).toBeNull();
	} finally {
		repairWrite.resolve();
		await Promise.all([reading, first, deleting, last]);
	}
});

test("failed cold SAVE keeps the draft dirty and recovery fallback out of persisted cache", async () => {
	commandDraft.edit("retained");
	const saved = commandDraft.capture();
	writeFile.mockImplementation(async () => {
		throw new Error("disk full");
	});
	const persisted = await updateConfig({ command: saved.value });
	if (persisted) commandDraft.confirmSaved(saved);
	expect(persisted).toBe(false);
	expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: true });
	expect(peekConfig()).toBeNull();
	expect(stored).toBe("{corrupt");
	expect(applicationWork.hasPendingWork()).toBe(false);
	expect(applicationWork.tryReserveInstall()).toBeNull();
	writeFile.mockImplementation(async (_path, bytes) => {
		stored = new TextDecoder().decode(bytes);
	});
	expect(await updateConfig({ command: saved.value })).toBe(true);
	commandDraft.confirmSaved(saved);
	expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: false });
	expect((await fetchConfig()).command).toBe("retained");
});

test("cold config read owns admission before entering the shared queue", async () => {
	const reading = fetchConfig();
	const reservation = applicationWork.tryReserveInstall();
	try {
		expect(reservation).toBeNull();
	} finally {
		reservation?.release();
		await reading;
	}
});
