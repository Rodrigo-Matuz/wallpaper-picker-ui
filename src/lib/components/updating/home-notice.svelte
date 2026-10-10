<script lang="ts">
import type { Readable } from "svelte/store";
import { toast } from "svelte-sonner";
import { goto } from "$app/navigation";
import { t } from "$lang/index";
import { languageReady, updaterSession } from "$utils/updating/session/runtime";
import { updaterController } from "$utils/updating/updating";

let {
	controller = updaterController,
	readyStore = languageReady,
	session = updaterSession,
}: {
	controller?: Pick<typeof updaterController, "state">;
	readyStore?: Readable<boolean>;
	session?: typeof updaterSession;
} = $props();
const snapshotStore = $derived(controller.state);
const translate = $derived($t);

$effect(() => {
	const candidate = $snapshotStore.availableUpdate;
	if (!$readyStore || $snapshotStore.status !== "available" || !candidate) return;
	if (!session.claimNotice(candidate.version)) return;
	// Dismissal belongs to Sonner only; never discard the controller's retained native resource.
	toast.info(translate("updater.notice.available").replace("{version}", candidate.version), {
		closeButton: true,
		duration: 12000,
		action: { label: translate("updater.action.about"), onClick: () => void goto("/about") },
	});
});
</script>
