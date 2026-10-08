import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { downloadExpression, installExpression } from "./protocol";

test("split download uses SDK Channel ordering and waits beyond Finished for signed bytes", async () => {
	let callback: (value: unknown) => void = () => {};
	let resolve: (rid: number) => void = () => {};
	let request: { command: string; args: Record<string, unknown> } | undefined;
	const internals = {
		transformCallback(fn: typeof callback, once: boolean) {
			expect(once).toBe(false);
			callback = fn;
			return 42;
		},
		unregisterCallback(id: number) {
			expect(id).toBe(42);
		},
		invoke(command: string, args: Record<string, unknown>) {
			request = { command, args };
			return new Promise<number>((r) => {
				resolve = r;
			});
		},
	};
	const context = { window: { __TAURI_INTERNALS__: internals } };
	runInNewContext(downloadExpression(7), context);
	expect(request?.command).toBe("plugin:updater|download");
	expect(request?.args).toMatchObject({ rid: 7, timeout: 600000 });
	expect(JSON.stringify(request?.args.onEvent)).toBe('"__CHANNEL__:42"');
	callback({ index: 1, message: { event: "Finished" } });
	callback({ index: 0, message: { event: "Started", data: { contentLength: 5 } } });
	callback({ index: 2, end: true });
	const state = () => runInNewContext("window.__nativeAcceptance", context);
	expect(state().events.map((e: { event: string }) => e.event)).toEqual(["Started", "Finished"]);
	expect(state().downloadVerified).toBe(false);
	expect(state().bytesRid).toBeUndefined();
	resolve(9);
	await new Promise((r) => setTimeout(r, 0));
	expect(state().downloadVerified).toBe(true);
	expect(state().bytesRid).toBe(9);
	let install: unknown;
	internals.invoke = async (command, args) => {
		install = { command, args };
		return 0;
	};
	runInNewContext(installExpression(7, 9), context);
	expect(install).toEqual({
		command: "plugin:updater|install",
		args: { updateRid: 7, bytesRid: 9 },
	});
});
