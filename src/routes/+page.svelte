<script lang="ts">
import { FolderSearch2, Settings } from "@lucide/svelte";
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import Display from "$components/display";
import { runThumbnailAction } from "$components/display/thumbnailAction";
import Navbar from "$components/navbar";
import HomeNotice from "$components/updating/home-notice.svelte";
import { selectFolder } from "$lib/api/system/selectFolder/selectFolder";
import { t } from "$lib/lang/index";
import { initializeApplicationSession } from "$utils/updating/session/runtime";

let searchQuery = $state("");
let loading = $state(true);
const translate = $derived($t);
let visibleWallpapers = $state(0);

onMount(async () => {
	try {
		await initializeApplicationSession();
	} finally {
		loading = false;
	}
});

const handleInputChange = (event: Event) => {
	const target = event.target as HTMLInputElement;
	searchQuery = target.value.toLowerCase();
};
</script>

{#if !loading}
    <HomeNotice />
    <div class="flex flex-col min-h-screen">
        <div class="flex-1">
            <Navbar
                leftIcon={FolderSearch2}
                leftOnClick={async () => {
                    const folderPath = await selectFolder();
                    if (folderPath) {
                        await runThumbnailAction(true);
                    }
                }}
                disableInput={false}
                autoFocusInput={true}
                inputPlaceholder={translate('home.search.placeholder')}
                onInputChange={handleInputChange}
                rightIcon={Settings}
                rightOnClick={() => goto('/settings')}
            />

            <div class="px-4 pb-8">
                <Display {searchQuery} onVisibleCountChange={(count) => { visibleWallpapers = count; }} />
            </div>
        </div>

        {#if visibleWallpapers === 0}
            <footer class="border-t border-foreground/10 bg-surface px-4 py-4">
                <div class="mx-auto flex max-w-7xl flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle sm:flex-row sm:items-center sm:justify-between">
                    <span>{translate('home.thank.you.footer')}</span>
                </div>
            </footer>
        {/if}
    </div>
{/if}
