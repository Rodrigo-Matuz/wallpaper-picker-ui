import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createApplicationWorkTracker } from "./applicationWork";

test("reserves only an idle tracker and publishes a read-only reservation until idempotent release", () => {
	const tracker = createApplicationWorkTracker();
	const work = tracker.beginWork();
	expect(tracker.tryReserveInstall()).toBeNull();
	work();
	const dirty = tracker.beginDirtyInput();
	expect(tracker.tryReserveInstall()).toBeNull();
	dirty();
	const reservation = tracker.tryReserveInstall();
	expect(reservation).not.toBeNull();
	expect(get(tracker.installationReserved)).toBe(true);
	expect("set" in tracker.installationReserved).toBe(false);
	expect(tracker.tryReserveInstall()).toBeNull();
	reservation?.release();
	reservation?.release();
	expect(get(tracker.installationReserved)).toBe(false);
	expect(tracker.getSnapshot()).toEqual({ pendingWork: 0, dirtyInputs: 0 });
	expect(tracker.tryReserveInstall()).not.toBeNull();
});

test("denies work and draft admission even in synchronous reservation subscribers", () => {
	const tracker = createApplicationWorkTracker();
	let observations = 0;
	const unsubscribe = tracker.installationReserved.subscribe((reserved) => {
		if (!reserved) return;
		observations++;
		expect(() => tracker.beginWork()).toThrow("Installation is reserved");
		expect(() => tracker.beginDirtyInput()).toThrow("Installation is reserved");
		expect(tracker.tryReserveInstall()).toBeNull();
	});
	const reservation = tracker.tryReserveInstall();
	try {
		expect(observations).toBe(1);
		expect(tracker.getSnapshot()).toEqual({ pendingWork: 0, dirtyInputs: 0 });
		reservation?.release();
		const next = tracker.tryReserveInstall();
		reservation?.release(); // An old owner cannot unlock a newer reservation.
		expect(() => tracker.beginWork()).toThrow("Installation is reserved");
		next?.release();
		const work = tracker.beginWork();
		work();
	} finally {
		unsubscribe();
		reservation?.release();
	}
});

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
