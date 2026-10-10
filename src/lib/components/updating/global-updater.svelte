<script lang="ts">
import type { Snippet } from "svelte";
import { t } from "$lang/index";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { updaterController } from "$utils/updating/updating";
import { statusKeys } from "./presentation";

let {
	controller = updaterController,
	reservation = applicationWork.installationReserved,
	children,
}: {
	controller?: Pick<typeof updaterController, "state">;
	reservation?: typeof applicationWork.installationReserved;
	children?: Snippet;
} = $props();
const snapshotStore = $derived(controller.state);
const translate = $derived($t);
const activeStatus = $derived(
	$snapshotStore.busy !== null ||
		[
			"downloading",
			"installing",
			"installer-handoff",
			"restarting",
			"restart-required",
		].includes($snapshotStore.status),
);
const messageKey = $derived(
	$reservation
		? "updater.status.reserved"
		: activeStatus
			? statusKeys[$snapshotStore.status]
			: undefined,
);
let announcement = $state<HTMLDivElement>();
$effect(() => {
	if ($reservation && announcement) announcement.focus();
});
</script>

{#if messageKey}
	<div bind:this={announcement} role="status" aria-live="polite" aria-atomic="true" tabindex="-1" class="relative z-[60] border-b border-success/20 bg-surface px-5 py-3 text-xs text-foreground focus:outline-none">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2">
			<p class="min-w-0">{translate(messageKey)}</p>
			{#if !$reservation}
				<a href="/about" class="inline-flex min-h-11 items-center text-success underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{translate("updater.action.about")}</a>
			{/if}
		</div>
	</div>
{/if}

<div data-installation-gate inert={$reservation}>
{#if children}{@render children()}{/if}
</div>
