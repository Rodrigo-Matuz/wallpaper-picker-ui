import { afterEach, expect, test } from "bun:test";
import { get } from "svelte/store";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { commandDraft } from "./commandDraft";

afterEach(() => commandDraft.discard(""));

test("an old save cannot clear newer edits even when the text changed back", () => {
	commandDraft.edit("first");
	const saving = commandDraft.capture();
	commandDraft.edit("second");
	commandDraft.edit("first");
	commandDraft.confirmSaved(saving);
	expect(get(commandDraft.state).dirty).toBe(true);
	expect(applicationWork.getSnapshot().dirtyInputs).toBe(1);
});

test("explicit discard restores the chosen command and releases the shared draft owner", () => {
	commandDraft.initialize("saved");
	commandDraft.edit("unsaved");
	expect(applicationWork.tryReserveInstall()).toBeNull();
	commandDraft.discard("saved");
	expect(get(commandDraft.state)).toEqual({ value: "saved", dirty: false });
	expect(applicationWork.hasDirtyInputs()).toBe(false);
	commandDraft.discard("saved");
	expect(applicationWork.getSnapshot().dirtyInputs).toBe(0);
});
