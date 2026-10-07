/** DOCS:
 * Creates passive application-owned work accounting, without subscriber callbacks.
 * Counts represent operation lifetimes (including queued/nested calls), not file counts
 * or successful persistence. A snapshot is frozen and never changes after it is read.
 *
 * These read-only counts are NOT race-free installation authorization: another
 * operation can start immediately after a read. Deliberately unwired from prepareInstall
 * until an exclusive reservation and corresponding UI handling exist.
 *
 * @returns An isolated tracker. beginWork/beginDirtyInput return idempotent releases;
 *          query methods have no side effects and getSnapshot returns a frozen copy.
 * @example
 * const release = tracker.beginWork();
 * try { await operation(); } finally { release(); }
 */
export function createApplicationWorkTracker() {
	const counts = { pendingWork: 0, dirtyInputs: 0 };

	function acquire(key: keyof typeof counts): () => void {
		counts[key]++;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			counts[key]--;
		};
	}

	return Object.freeze({
		beginWork: () => acquire("pendingWork"),
		// One token per dirty component, released only on reliable reset or unmount.
		beginDirtyInput: () => acquire("dirtyInputs"),
		hasPendingWork: () => counts.pendingWork > 0,
		hasDirtyInputs: () => counts.dirtyInputs > 0,
		getSnapshot: () => Object.freeze({ ...counts }),
	});
}

/** Passive accounting shared by application operations; not an updater safety gate. */
export const applicationWork = createApplicationWorkTracker();
