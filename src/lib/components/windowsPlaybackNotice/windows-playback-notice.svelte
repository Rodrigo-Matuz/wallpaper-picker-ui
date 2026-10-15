<script lang="ts">
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import Info from "@lucide/svelte/icons/info";
import { onMount } from "svelte";
import { t } from "$lib/lang/index";
import { isWindowsPlatform } from "$utils/platform/platform";

let { userAgent }: { userAgent?: string } = $props();
const translate = $derived($t);
let visible = $state(false);

onMount(() => {
	visible = isWindowsPlatform(userAgent);
});
</script>

{#if visible}
    <aside class="flex items-start gap-3 border border-primary/20 bg-primary/[0.04] px-4 py-3 text-left" aria-label={translate("windows.playback.requirement.title")}>
        <Info class="mt-0.5 size-4 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{translate("windows.playback.requirement.title")}</p>
            <p class="mt-1 max-w-3xl text-xs leading-5 text-muted">{translate("windows.playback.requirement.description")}</p>
        </div>
        <a
            href="https://mpv.io/installation/"
            target="_blank"
            rel="noreferrer"
            class="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-foreground"
        >
            {translate("windows.playback.requirement.install")}
            <ArrowUpRight class="size-3" />
        </a>
    </aside>
{/if}
