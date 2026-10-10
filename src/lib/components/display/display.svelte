<script lang="ts">
import { CirclePlay } from "@lucide/svelte";
import { onMount } from "svelte";
import { sendCommand } from "$api/system/execCommand/execCommand";
import { thumbnails, thumbnailsGenerated, totalVideos } from "$api/thumbnails/handle";
import { Progress } from "$components/ui/progress";
import { t } from "$lib/lang/index";
import { normalizeForSearch } from "$lib/utils/search/search";
import { runThumbnailAction } from "./thumbnailAction";

export let searchQuery: string = "";
export let onVisibleCountChange: (count: number) => void = () => {};

let value = 0;

onMount(() => {
	const unsubscribe = thumbnailsGenerated.subscribe((count) => {
		value = count;
	});

	void runThumbnailAction();

	return () => unsubscribe();
});

$: normalizedSearchQuery = normalizeForSearch(searchQuery);

$: filteredThumbnails = Object.entries($thumbnails).filter(([, videoPath]) =>
	normalizeForSearch(videoPath).includes(normalizedSearchQuery),
);
$: onVisibleCountChange(
	$totalVideos > 0 && $thumbnailsGenerated < $totalVideos ? 0 : filteredThumbnails.length,
);
</script>

{#if $totalVideos > 0 && $thumbnailsGenerated < $totalVideos}
    <div class="flex flex-col items-center mt-40 w-full">
        <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {$t('home.thumbs.generating.text')} {value} / {$totalVideos}
        </p>
        <Progress
            {value}
            max={$totalVideos}
            class="bg-surface border-border border w-[60%] h-1 rounded-none"
        />
        <p class="mt-2 max-w-md text-subtle text-xs text-center font-mono tracking-wide">
            {$t('home.thumbs.generating.hint')}
        </p>
    </div>
{:else}
    <div class="flex flex-wrap justify-center gap-3 mt-6">
        {#each filteredThumbnails as [blobUrl, videoPath]}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                tabindex="0"
                role="button"
                class="group relative border border-transparent hover:border-primary outline-none transition-colors cursor-pointer"
                on:click={() => sendCommand(videoPath)}
            >
                <div class="relative overflow-hidden rounded-md border border-foreground/10 bg-surface">
                    <img src={blobUrl} alt={videoPath} class="aspect-video w-48 h-32 object-cover" />
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="absolute inset-0 flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <CirclePlay class="text-foreground text-3xl" size={40} />
                    </div>
                </div>
                <p class="mt-1 text-center text-subtle text-xs font-mono tracking-wide truncate max-w-[192px]">
                    {videoPath.split(/[\\/]/).pop()}
                </p>
            </div>
        {/each}
    </div>
{/if}
