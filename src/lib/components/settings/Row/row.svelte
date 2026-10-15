<script lang="ts">
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import type { Snippet } from "svelte";
import { t } from "$lang/index";

interface Props {
	name: string;
	shortDescription: string;
	hintDescription: string;
	stacked?: boolean;
	children: Snippet<[string, string]>;
}

let { name, shortDescription, hintDescription, stacked = false, children }: Props = $props();
const id = $props.id();
const labelId = `${id}-label`;
const descriptionId = `${id}-description`;
const translate = $derived($t);
</script>

<div
    data-slot="settings-row"
    data-setting-name={name}
    class={`grid min-w-0 gap-x-8 gap-y-5 bg-background/20 px-5 py-6 sm:px-6 ${stacked ? '' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}
>
    <div class="min-w-0">
        <h3 id={labelId} class="text-[18px] font-medium leading-6 tracking-[-0.01em] text-foreground">{name}</h3>
        <p id={descriptionId} class="mt-1 max-w-lg text-[13px] leading-6 text-muted">{shortDescription}</p>
        {#if hintDescription}
            <details class="group mt-5 max-w-2xl border border-foreground/10 border-l-primary/45 bg-surface/45">
                <summary
                    class="flex min-h-10 w-full cursor-pointer list-none items-center gap-2 px-3 text-xs text-subtle transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
                    aria-label={`${translate('settings.help.label')}: ${name}`}
                >
                    <ChevronDown class="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
                    <span class="font-mono text-[10px] uppercase tracking-[0.14em]">{translate('settings.help.label')}</span>
                </summary>
                <div class="border-t border-foreground/10 px-3 pb-4 pt-3 text-[13px] leading-6 text-muted [&_a]:underline [&_a]:underline-offset-4">
                    {@html hintDescription}
                </div>
            </details>
        {/if}
    </div>
    <div class={stacked ? 'min-w-0' : 'flex min-w-0 items-start sm:justify-self-end sm:pt-1'}>
        {@render children(labelId, descriptionId)}
    </div>
</div>
