import { requireThat } from "./guards";

export function validRid(value: unknown): asserts value is number {
	requireThat(Number.isSafeInteger(value) && Number(value) >= 0, "Invalid private resource ID");
}

// Locked @tauri-apps/api/core.js Channel wire format; Finished precedes signature verification.
export function downloadExpression(rid: number): string {
	validRid(rid);
	return `(() => {
	 const ipc = window.__TAURI_INTERNALS__;
	 const state = window.__nativeAcceptance = { events: [], downloadVerified: false };
	 let next = 0, end;
	 const pending = {};
	 const id = ipc.transformCallback((raw) => {
	  if ('end' in raw) {
	   if (raw.index === next) ipc.unregisterCallback(id); else end = raw.index;
	   return;
	  }
	  pending[raw.index] = raw.message;
	  while (next in pending) { state.events.push(pending[next]); delete pending[next++]; }
	  if (next === end) ipc.unregisterCallback(id);
	 }, false);
	 const channel = { id, __TAURI_TO_IPC_KEY__() { return '__CHANNEL__:' + id; }, toJSON() { return this.__TAURI_TO_IPC_KEY__(); } };
	 ipc.invoke('plugin:updater|download', { rid: ${rid}, onEvent: channel, timeout: 600000 })
	  .then((bytesRid) => { state.bytesRid = bytesRid; state.downloadVerified = true; })
	  .catch((error) => { state.error = String(error); });
	 return { started: true };
	})()`;
}

export function installExpression(updateRid: number, bytesRid: number): string {
	validRid(updateRid);
	validRid(bytesRid);
	return `(() => {
	 const state = window.__nativeAcceptance;
	 if (!state || !state.downloadVerified || state.bytesRid !== ${bytesRid}) throw new Error('Unverified native download');
	 state.installRequested = true;
	 window.__TAURI_INTERNALS__.invoke('plugin:updater|install', { updateRid: ${updateRid}, bytesRid: ${bytesRid} })
	  .then(() => { state.installResolved = true; }).catch((error) => { state.installError = String(error); });
	 return { requested: true };
	})()`;
}
