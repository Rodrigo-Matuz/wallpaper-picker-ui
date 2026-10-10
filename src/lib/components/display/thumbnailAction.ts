import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { handleThumbnails } from "$api/thumbnails/handle";
import { t } from "$lang/index";

/** DOCS: Consume thumbnail admission/pipeline rejections at fire-and-forget UI boundaries.
 * Use the existing translated failure toast; never read config for diagnostics here:
 * admission can be denied before the pipeline starts. No retry on reservation release.
 * Pipeline-owned diagnostics and concurrency remain unchanged.
 * @returns True when thumbnail work completes, false when denied or rejected.
 */
export async function runThumbnailAction(forceRegenerate = false): Promise<boolean> {
	try {
		await handleThumbnails(forceRegenerate);
		return true;
	} catch {
		toast.error(get(t)("toast.thumbnails.failed"));
		return false;
	}
}
