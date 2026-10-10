import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { t } from "$lang/index";

/** DOCS: UI boundary for legacy void actions and truthful boolean persistence results.
 * False/rejection is reported, never promoted to persistence success or floated to UI.
 * @returns Whether the action settled without a reported failure.
 */
export async function runSettingsAction(action: () => unknown): Promise<boolean> {
	try {
		if ((await action()) !== false) return true;
	} catch {
		// Persistence APIs retain diagnostic ownership; this boundary reports UI failure.
	}
	toast.error(get(t)("toast.settings.failed"));
	return false;
}
