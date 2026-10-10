import { mock } from "bun:test";
import { defaultConfig } from "$api/config/defaults";
import { CONFIG_FILE_PATH, CONFIG_ROOT_DIR } from "$utils/paths";

// Fresh-process fixture: an expected RED deadlock cannot poison other tests' queue.
const [operation, failure] = process.argv.slice(2);
let stored = JSON.stringify(defaultConfig);
const effects = { directoryFailures: 0, reads: 0, writes: 0, logs: 0 };
mock.module("@tauri-apps/plugin-fs", () => ({
	BaseDirectory: { Config: 13 },
	exists: async (path: string) => {
		if (path === CONFIG_ROOT_DIR) {
			if (failure === "exists") {
				effects.directoryFailures++;
				throw new Error("mocked directory permission failure");
			}
			return false;
		}
		return path === CONFIG_FILE_PATH && Boolean(stored);
	},
	mkdir: async () => {
		effects.directoryFailures++;
		throw new Error("mocked mkdir permission failure");
	},
	readTextFile: async () => {
		effects.reads++;
		return stored;
	},
	writeFile: async (_path: string, bytes: Uint8Array) => {
		effects.writes++;
		stored = new TextDecoder().decode(bytes);
	},
	remove: async () => {
		stored = "";
	},
}));
mock.module("@tauri-apps/api/core", () => ({
	invoke: async () => {
		effects.logs++;
	},
}));
const { fetchConfig, setConfigCache } = await import("./read");
const { updateConfig } = await import("../update/update");
const { clearConfig } = await import("../clear");
const { applicationWork } = await import("$utils/applicationWork/applicationWork");
if (operation === "cached-save") setConfigCache({ ...defaultConfig, debugMode: true });
let timer: ReturnType<typeof setTimeout> | undefined;
const action =
	operation === "clear"
		? clearConfig()
		: operation.includes("save")
			? updateConfig({ command: "retained" })
			: fetchConfig();
const outcome = await Promise.race([
	action.then(
		() => "settled",
		() => "rejected",
	),
	new Promise<string>((resolve) => {
		timer = setTimeout(() => resolve("deadlocked"), 500);
	}),
]);
if (timer) clearTimeout(timer);
console.log(
	JSON.stringify({
		outcome,
		pending: applicationWork.hasPendingWork(),
		effects,
		command: stored ? JSON.parse(stored).command : null,
	}),
);
process.exitCode = outcome === "deadlocked" ? 1 : 0;
