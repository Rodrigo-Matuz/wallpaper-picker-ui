import { readonly, writable } from "svelte/store";
import { defaultConfig } from "$api/config/defaults";
import { configReset } from "$api/config/mutationOrdering";
import { applicationWork } from "$utils/applicationWork/applicationWork";

// Session-owned command draft: route unmount is not a save or discard operation.
let value = "";
let dirty = false;
let revision = 0;
let releaseDirty: (() => void) | undefined;
const state = writable({ value, dirty });

// Deletion is not discard: retain text, invalidate old acknowledgements/loads,
// and own differing text even if its SAVE completed before DELETE.
configReset.subscribe((identity) => {
	if (identity === 0) return;
	revision++;
	if (value !== defaultConfig.command) {
		releaseDirty ??= applicationWork.beginDirtyInput();
		dirty = true;
	}
	state.set({ value, dirty });
});

/** DOCS: One shared command draft across all Settings mounts. */
export const commandDraft = {
	state: readonly(state),
	initialize(command: string, loadedRevision = revision) {
		if (dirty || loadedRevision !== revision) return;
		value = command;
		state.set({ value, dirty });
	},
	edit(command: string) {
		releaseDirty ??= applicationWork.beginDirtyInput();
		revision++;
		value = command;
		dirty = true;
		state.set({ value, dirty });
	},
	/** Capture an edit identity so an older save cannot clear a newer draft. */
	capture() {
		return Object.freeze({ value, revision });
	},
	confirmSaved(saved: { value: string; revision: number }) {
		if (saved.revision !== revision || saved.value !== value) return;
		dirty = false;
		releaseDirty?.();
		releaseDirty = undefined;
		state.set({ value, dirty });
	},
	/** Explicit caller-owned discard only; never call from route teardown. */
	discard(command: string) {
		revision++;
		value = command;
		this.confirmSaved(this.capture());
	},
};
