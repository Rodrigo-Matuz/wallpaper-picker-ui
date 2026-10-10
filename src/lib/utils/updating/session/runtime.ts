import { isTauri } from "@tauri-apps/api/core";
import { writable } from "svelte/store";
import { fetchConfig } from "$api/config/read/read";
import { currentLanguage, languages } from "$lang/index";
import { updaterController } from "$utils/updating/updating";
import { createUpdaterSession } from "./session";

export const languageReady = writable(false);
export const runtimeMode = writable<"browser" | "development" | "native" | null>(null);
export const updaterSession = createUpdaterSession(() => updaterController.checkForUpdates());
let initialization: Promise<void> | null = null;

/** DOCS:
 * Initialize stored language once without persistence, then start the nonblocking launch check.
 * SSR is inert. Browser/development never call the updater; the controller enforces native policy.
 * A failed config read uses the registered default language, not a config rewrite.
 */
export function initializeApplicationSession(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	if (initialization) return initialization;
	const native = isTauri();
	const development = import.meta.env.DEV;
	runtimeMode.set(!native ? "browser" : development ? "development" : "native");
	initialization = (async () => {
		if (native) {
			try {
				const config = await fetchConfig();
				if (Object.hasOwn(languages, config.language)) currentLanguage.set(config.language);
			} catch {
				// Config owns diagnostics; use the already registered default without mutating storage.
			}
		}
		languageReady.set(true);
	})();
	void updaterSession.start({ native, development, languageReady: initialization });
	return initialization;
}
