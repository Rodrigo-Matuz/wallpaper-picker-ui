import { auditDraft } from "./audit";
import { createGitHubReader } from "./github";

if (import.meta.main) {
	try {
		const result = await auditDraft(
			process.env.GITHUB_REPOSITORY ?? "",
			process.env.GITHUB_REF_NAME ?? "",
			createGitHubReader(),
		);
		console.log(
			JSON.stringify({
				...result,
				verification:
					"uploaded metadata and signature sidecar equality only; not payload cryptography or runtime acceptance",
			}),
		);
	} catch {
		// Network errors can contain signed redirect URLs. Never print raw errors,
		// authentication headers, tokens, or server response bodies.
		console.error(
			"Release contract verification failed; inspect the draft's latest.json, exact installer assets and signature sidecars.",
		);
		process.exitCode = 1;
	}
}
