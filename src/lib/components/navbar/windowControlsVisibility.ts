import { writable } from "svelte/store";

/** Shared across routes so Settings can hide the controls without a reload. */
export const windowControlsVisible = writable(true);
