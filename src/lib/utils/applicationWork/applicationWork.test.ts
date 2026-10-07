import { expect, test } from "bun:test";
import { createApplicationWorkTracker } from "./applicationWork";

test("dirty owners release independently without affecting pending work", () => {
	const tracker = createApplicationWorkTracker();
	const other = createApplicationWorkTracker();
	const first = tracker.beginDirtyInput();
	const second = tracker.beginDirtyInput();
	const snapshot = tracker.getSnapshot();
	expect(snapshot.dirtyInputs).toBe(2);
	expect(tracker.hasDirtyInputs()).toBe(true);
	expect(tracker.hasPendingWork()).toBe(false);
	expect(other.hasDirtyInputs()).toBe(false);
	first();
	first();
	expect(tracker.getSnapshot().dirtyInputs).toBe(1);
	second();
	expect(tracker.hasDirtyInputs()).toBe(false);
	expect(snapshot.dirtyInputs).toBe(2);
});

test("counts overlapping work until every idempotent release settles", () => {
	const tracker = createApplicationWorkTracker();
	const before = tracker.getSnapshot();
	const first = tracker.beginWork();
	const second = tracker.beginWork();
	expect(tracker.hasPendingWork()).toBe(true);
	expect(tracker.getSnapshot().pendingWork).toBe(2);
	first();
	first();
	expect(tracker.getSnapshot().pendingWork).toBe(1);
	second();
	expect(tracker.hasPendingWork()).toBe(false);
	expect(before.pendingWork).toBe(0);
	expect(Object.isFrozen(before)).toBe(true);
	expect(Object.isFrozen(tracker.getSnapshot())).toBe(true);
});
