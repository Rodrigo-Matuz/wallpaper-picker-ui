import { readonly, writable } from "svelte/store";

/** DOCS: Typed admission denial; UI handlers must report it rather than float rejection. */
export class InstallationReservedError extends Error {
	constructor() {
		super("Installation is reserved");
		this.name = "InstallationReservedError";
	}
}

/** DOCS: Creates isolated lifetime accounting; frozen count snapshots remain passive.
 * Only tryReserveInstall authorizes installation. Its read-only store is for UI gating.
 * @returns Work/draft owners and an exclusive, idempotently releasable reservation.
 */
export function createApplicationWorkTracker() {
	const counts = { pendingWork: 0, dirtyInputs: 0 };
	let reserved = false;
	const reservationState = writable(false);

	function acquire(key: keyof typeof counts): () => void {
		if (reserved) throw new InstallationReservedError();
		counts[key]++;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			counts[key]--;
		};
	}

	/** Reserve synchronously before publishing; count snapshots are not authorization. */
	function tryReserveInstall(): null | { release(): void } {
		if (reserved || counts.pendingWork || counts.dirtyInputs) return null;
		reserved = true;
		reservationState.set(true);
		let released = false;
		return Object.freeze({
			release() {
				if (released) return;
				released = true;
				reserved = false;
				reservationState.set(false);
			},
		});
	}

	return Object.freeze({
		beginWork: () => acquire("pendingWork"),
		beginDirtyInput: () => acquire("dirtyInputs"),
		hasPendingWork: () => counts.pendingWork > 0,
		hasDirtyInputs: () => counts.dirtyInputs > 0,
		getSnapshot: () => Object.freeze({ ...counts }),
		tryReserveInstall,
		installationReserved: readonly(reservationState),
	});
}

/** Application-wide work owners and exclusive installation admission barrier. */
export const applicationWork = createApplicationWorkTracker();
