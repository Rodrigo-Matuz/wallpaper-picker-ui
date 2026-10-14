<script lang="ts">
import { t } from "$lang/index";
import { parseReleaseNotes, releaseNotesPreview } from "./release-notes";

let { body }: { body: string } = $props();
const translate = $derived($t);
const id = $props.id();
let expanded = $state(false);
const preview = $derived(releaseNotesPreview(body));
const truncated = $derived(preview !== body);
const blocks = $derived(parseReleaseNotes(expanded ? body : preview));
</script>

<div id={id} class="mt-1 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
	{#each blocks as block}
		<svelte:element this={block.tag} class={block.tag === "p" ? "min-h-6" : "font-medium text-foreground"}>
			{#each block.content as part}{#if part.kind === "strong"}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}
		</svelte:element>
	{/each}
	{#if truncated && !expanded}<span>...</span>{/if}
</div>
{#if truncated}
	<button type="button" aria-expanded={expanded} aria-controls={id} onclick={() => expanded = !expanded} class="mt-1 min-h-11 text-foreground underline underline-offset-4 hover:text-success focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-success">{translate(expanded ? "updater.notes.read.less" : "updater.notes.read.more")}</button>
{/if}
