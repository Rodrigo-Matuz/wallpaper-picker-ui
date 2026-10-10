import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import { clearConfig } from "$api/config/clear";
import { defaultConfig } from "$api/config/defaults";
import { clearConfigCache, fetchConfig } from "$api/config/read/read";
import { updateConfig } from "$api/config/update/update";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import SettingsButton from "../Button/button.svelte";
import { commandDraft } from "./commandDraft";
import SettingsInput from "./input.svelte";

const effects = vi.hoisted(() => ({
	stored: JSON.stringify({ command: "initial" }),
	remove: vi.fn(async () => {
		effects.stored = "";
	}),
	write: vi.fn(async (_path: string, bytes: Uint8Array) => {
		effects.stored = new TextDecoder().decode(bytes);
	}),
	log: vi.fn(async (_message: unknown) => {}),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
	BaseDirectory: { Config: 13 },
	exists: vi.fn(async () => Boolean(effects.stored)),
	readTextFile: vi.fn(async () => effects.stored),
	writeFile: effects.write,
	remove: effects.remove,
}));
vi.mock("$utils/ensureDirs", () => ({ ensureDir: vi.fn(async () => {}) }));
vi.mock("$utils/logger/logger", () => ({ log: effects.log }));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

afterEach(() => {
	cleanup();
	commandDraft.discard("");
	clearConfigCache();
	effects.stored = JSON.stringify({ ...defaultConfig, command: "initial" });
	vi.clearAllMocks();
});

test("corrupt repair cannot overwrite a command SAVE acknowledged as clean", async () => {
	commandDraft.discard("initial");
	commandDraft.edit("retained");
	const saved = commandDraft.capture();
	effects.stored = "{corrupt";
	const repairStarted = deferred();
	const repairWrite = deferred();
	effects.write.mockImplementationOnce(async (_path, bytes) => {
		repairStarted.resolve();
		await repairWrite.promise;
		effects.stored = new TextDecoder().decode(bytes);
	});
	const repairing = fetchConfig();
	let saving: Promise<boolean> | undefined;
	let acknowledgedBeforeRepair = false;
	try {
		await repairStarted.promise;
		saving = updateConfig({ command: saved.value }).then((persisted) => {
			if (persisted) commandDraft.confirmSaved(saved);
			return persisted;
		});
		// Drain ready mocked IPC: the old fallback lets SAVE finish while repair is blocked.
		await new Promise((resolve) => setTimeout(resolve, 0));
		acknowledgedBeforeRepair = !get(commandDraft.state).dirty;
	} finally {
		repairWrite.resolve();
		await Promise.all([repairing, saving]);
	}
	expect({
		acknowledgedBeforeRepair,
		persistedCommand: JSON.parse(effects.stored).command,
		draft: get(commandDraft.state),
	}).toEqual({
		acknowledgedBeforeRepair: false,
		persistedCommand: "retained",
		draft: { value: "retained", dirty: false },
	});
	expect((await fetchConfig()).command).toBe("retained");
});

test("failed DELETE preserves saved command/cache and does not invalidate its identity", async () => {
	commandDraft.initialize("saved");
	expect(await updateConfig({ command: "saved" })).toBe(true);
	const saved = commandDraft.capture();
	effects.remove.mockRejectedValueOnce(new Error("delete denied"));
	expect(await clearConfig()).toBe(false);
	expect(commandDraft.capture()).toEqual(saved);
	expect(get(commandDraft.state)).toEqual({ value: "saved", dirty: false });
	expect((await fetchConfig()).command).toBe("saved");
});

test("SAVE queued after DELETE recreates defaults before applying the retained command", async () => {
	commandDraft.initialize("saved");
	commandDraft.edit("retained");
	const saved = commandDraft.capture();
	const deleting = clearConfig();
	const saving = updateConfig({ command: saved.value });
	expect(await deleting).toBe(true);
	expect(await saving).toBe(true);
	expect((await fetchConfig()).command).toBe("retained");
	expect(JSON.parse(effects.stored)).toEqual({ ...defaultConfig, command: "retained" });
	// A capture made before reset is stale even if that queued write later succeeds.
	commandDraft.confirmSaved(saved);
	expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: true });
});

test("confirmed DELETE preserves empty clean text without admitting work before diagnostics settle", async () => {
	commandDraft.discard(defaultConfig.command);
	const logged = deferred();
	const logging = deferred();
	effects.log.mockImplementationOnce(async () => {
		logged.resolve();
		await logging.promise;
	});
	const deleting = clearConfig();
	try {
		await logged.promise;
		expect(get(commandDraft.state)).toEqual({ value: defaultConfig.command, dirty: false });
		expect(applicationWork.tryReserveInstall()).toBeNull();
	} finally {
		logging.resolve();
		await deleting;
	}
	const reservation = applicationWork.tryReserveInstall();
	expect(reservation).not.toBeNull();
	reservation?.release();
});

test("completed SAVE then DELETE retains differing text dirty across remount", async () => {
	const mounted = render(SettingsInput, { name: "Command" });
	const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
	await waitFor(() => expect(field.value).toBe("initial"));
	await fireEvent.input(field, { target: { value: "retained" } });
	await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
	await waitFor(() => expect(get(commandDraft.state).dirty).toBe(false));
	const saved = commandDraft.capture();
	expect(await clearConfig()).toBe(true);
	commandDraft.confirmSaved(saved);
	expect((await fetchConfig()).command).toBe(defaultConfig.command);
	expect(get(commandDraft.state)).toEqual({ value: "retained", dirty: true });
	expect(applicationWork.tryReserveInstall()).toBeNull();
	mounted.unmount();
	render(SettingsInput, { name: "Command" });
	await waitFor(() =>
		expect((screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement).value).toBe(
			"retained",
		),
	);
	await fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
	await waitFor(() => expect(get(commandDraft.state).dirty).toBe(false));
	expect((await fetchConfig()).command).toBe("retained");
});

test("DELETE waits for SAVE acknowledgement and retains the reset command as dirty", async () => {
	render(SettingsInput, { name: "Command" });
	render(SettingsButton, {
		name: "Delete Config",
		buttonName: "DELETE",
		buttonOnClick: clearConfig,
	});
	const field = screen.getByRole("textbox", { name: "Command" }) as HTMLInputElement;
	await waitFor(() => expect(field.value).toBe("initial"));
	await fireEvent.input(field, { target: { value: "retained" } });
	const logged = deferred();
	const logging = deferred();
	effects.log.mockImplementationOnce(async () => {
		logged.resolve();
		await logging.promise;
	});
	let saving: Promise<unknown> | undefined;
	let deleting: Promise<unknown> | undefined;
	try {
		saving = fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
		await logged.promise;
		expect(JSON.parse(effects.stored).command).toBe("retained");
		deleting = fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
		await deleting;
		expect(effects.remove).not.toHaveBeenCalled();
		logging.resolve();
		await saving;
		await waitFor(() => expect(effects.remove).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(applicationWork.hasPendingWork()).toBe(false));
		expect((await fetchConfig()).command).toBe(defaultConfig.command);
		expect(field.value).toBe("retained");
		expect(get(commandDraft.state).dirty).toBe(true);
		expect(applicationWork.tryReserveInstall()).toBeNull();
	} finally {
		logging.resolve();
		await Promise.all([saving, deleting]);
	}
});
