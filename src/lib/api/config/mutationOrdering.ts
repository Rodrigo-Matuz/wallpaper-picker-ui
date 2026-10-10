import { readonly, writable } from "svelte/store";

let mutationQueue: Promise<unknown> = Promise.resolve();
const resetState = writable(0);
let resetIdentity = 0;

/** DOCS: Confirmed deletions invalidate draft/save identities before reset diagnostics.
 * This is a persistence event, not a command discard or a persisted-default cache.
 */
export const configReset = readonly(resetState);

/** DOCS: Publish only after native removal succeeds, while its work owner is held. */
export function confirmConfigReset(): void {
	resetState.set(++resetIdentity);
}

/** DOCS: An exact queue-owner identity permits only its own nested config reads. */
export type ConfigMutationOwner = Readonly<{ identity: symbol }>;
let activeOwner: ConfigMutationOwner | undefined;

/** DOCS: Order mutations and cold reads/recovery through persistence and diagnostics.
 * Only an explicitly passed active owner may nest without enqueueing behind itself.
 * Rejections do not poison later operations. Callers own mutation admission.
 */
export function queueConfigMutation<T>(
	mutation: (owner: ConfigMutationOwner) => Promise<T>,
	owner?: ConfigMutationOwner,
): Promise<T> {
	if (owner && owner === activeOwner) return mutation(owner);
	const run = mutationQueue.then(async () => {
		const current = Object.freeze({ identity: Symbol() });
		activeOwner = current;
		try {
			return await mutation(current);
		} finally {
			activeOwner = undefined;
		}
	});
	mutationQueue = run.catch(() => {});
	return run;
}
