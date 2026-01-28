<script lang="ts">
    import { goto } from "$app/navigation";
    import { fetchConfig } from "$api/config/read";
    import { selectFolder } from "$api/system/selectFolder";
    import Display from "$components/display";
    import Navbar from "$components/navbar";
    import { setLanguage, t, currentLanguage } from "$lang/index";
    import { FolderSearch2, Settings } from "@lucide/svelte";
    import { onMount } from "svelte";
    import { handleThumbnails } from "$api/thumbnails/handle";

    let searchQuery = "";
    let loading = true;

    onMount(async () => {
        try {
            const config = await fetchConfig();
            setLanguage(config.language);
            $currentLanguage = config.language;
        } catch (error) {
            console.error("Failed to load config", error);
        } finally {
            loading = false;
        }
    });

    const handleInputChange = (event: InputEvent) => {
        const target = event.target as HTMLInputElement;
        searchQuery = target.value.toLowerCase();
    };
</script>

{#if !loading}
    <div class="flex flex-col min-h-screen">
        <div class="grow">
            <Navbar
                leftOnClick={async () => {
                    const folderPath = await selectFolder();
                    if (folderPath) {
                        await handleThumbnails(true);
                    }
                }}
                disableInput={false}
                autoFocusInput={true}
                inputPlaceholder={$t("homeSearchPlaceholder")}
                onInputChange={handleInputChange}
                rightIcon={Settings}
                rightOnClick={() => goto("/settings")}
            />
            <Display {searchQuery} />
        </div>
        <footer
            class="my-2 text-muted-foreground text-center pointer-events-none select-none"
        >
            {$t("homeThankYouFooter")}
        </footer>
    </div>
{/if}
