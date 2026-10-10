interface LaunchReadiness {
	readonly native: boolean;
	readonly development: boolean;
	readonly languageReady: Promise<void>;
}

/** DOCS: Owns one launch check for a native session, independent of route lifetime. */
export function createUpdaterSession(check: () => Promise<unknown>) {
	let started = false;
	const noticedVersions = new Set<string>();
	return Object.freeze({
		claimNotice(version: string) {
			if (noticedVersions.has(version)) return false;
			noticedVersions.add(version);
			return true;
		},
		async start({ native, development, languageReady }: LaunchReadiness) {
			if (!native || development || started) return;
			started = true;
			await languageReady;
			// The controller owns support policy and errors. Never join the network operation here.
			void check().catch(() => {});
		},
	});
}
