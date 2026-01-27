<script lang="ts">
    import { sendCommand } from "$api/system/execCommand";
    import { CirclePlay } from "@lucide/svelte";
    import { onMount } from "svelte";
    import {
        handleThumbnails,
        thumbnails,
        totalVideos,
        thumbnailsGenerated,
    } from "$api/thumbnails/handle";
    import { Progress } from "$components/ui/progress";
    import { t } from "$lang/index";

    export let searchQuery: string = "";

    let value = 0;

    onMount(() => {
        const unsubscribe = thumbnailsGenerated.subscribe((count) => {
            value = count;
        });

        handleThumbnails();

        return () => unsubscribe();
    });

    $: normalizedSearchQuery = searchQuery.replace(/[_\s]+/g, "").toLowerCase();

    $: filteredThumbnails = Object.entries($thumbnails).filter(
        ([, videoPath]) =>
            videoPath
                .replace(/[_\s]+/g, "")
                .toLowerCase()
                .includes(normalizedSearchQuery),
    );
</script>

{#if $totalVideos > 0 && $thumbnailsGenerated < $totalVideos}
    <!-- Show progress bar -->
    <div class="flex flex-col items-center mt-40 w-full">
        <p class="mb-4">
            {t("homeGeneratingThumbsText")}
            {value} / {$totalVideos}
        </p>
        <Progress {value} max={$totalVideos} class="bg-card w-[60%] h-2" />
    </div>
{:else}
    <!-- Show thumbnails -->
    <div class="flex flex-wrap justify-center gap-2 mt-4">
        {#each filteredThumbnails as [blobUrl, videoPath]}
            <!-- Thumbnail content -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                tabindex="0"
                role="button"
                class="group relative border-2 border-transparent hover:border-primary outline-none"
                on:click={() => sendCommand(videoPath)}
            >
                <div class="relative">
                    <img src={blobUrl} alt={videoPath} />
                    <div
                        class="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100"
                    ></div>
                    <div
                        class="absolute inset-0 flex justify-center items-center opacity-0 group-hover:opacity-100"
                    >
                        <div class="relative">
                            <div
                                class="absolute -inset-1 bg-linear-to-r from-black to-black blur-lg rounded-full"
                            ></div>
                            <CirclePlay
                                class="relative text-accent text-4xl"
                                size={50}
                            />
                        </div>
                    </div>
                </div>
            </div>
        {/each}
    </div>
{/if}
