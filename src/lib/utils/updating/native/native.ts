import type { Resource } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import type { NativeUpdateResource } from "$types/updateTypes";

// Locked updater 2.9.0 declares this field private in TS but owns it as a JS property.
// Its close() does not clear successfully closed bytes before closing the update resource.
interface LockedUpdateResources {
	downloadedBytes?: Pick<Resource, "close">;
}

/** DOCS:
 * Owns the locked SDK Update privately, with resumable cleanup of its two native resources.
 * @param update - The SDK resource acquired by the lazy native check adapter.
 * @returns Private metadata getters, bound lifecycle methods, and confirmed-release cleanup.
 */
export function createNativeUpdateResource(update: Update): NativeUpdateResource {
	const metadata: NativeUpdateResource = update;
	const resources = update as unknown as LockedUpdateResources;
	const closeUpdate = update.close.bind(update);
	let released = false;
	return Object.freeze({
		get currentVersion() {
			return metadata.currentVersion;
		},
		get version() {
			return metadata.version;
		},
		get body() {
			return metadata.body;
		},
		get date() {
			return metadata.date;
		},
		download: update.download.bind(update),
		install: update.install.bind(update),
		async close() {
			if (released) return;
			const bytes = resources.downloadedBytes;
			if (bytes) {
				await bytes.close();
				// Forget only confirmed bytes release; a rejection leaves them quarantined.
				resources.downloadedBytes = undefined;
			}
			await closeUpdate();
			released = true;
		},
	});
}
