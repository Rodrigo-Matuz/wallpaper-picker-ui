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
    import { checkForUpdates, getUpdateState } from "$utils/updating";
    import { toast } from "svelte-sonner";
    import { Toaster } from "$components/ui/sonner";

    let searchQuery = "";
    let loading = true;

    onMount(async () => {
        try {
            const config = await fetchConfig();
            setLanguage(config.language);
            $currentLanguage = config.language;

            await checkForUpdates();

            const { state } = getUpdateState();
            if (state === "available") {
                toast.info("New update available at settings page", {
                    action: {
                        label: "OK",
                        onClick: () => {},
                    },
                });
            }
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

<Toaster />
{#if !loading}
    <div class="flex flex-col min-h-screen">
        <div class="mb-5 grow">
            <Navbar
                leftIcon={FolderSearch2}
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
            class="bg-card mt-auto py-3 border-t text-muted-foreground text-center pointer-events-none select-none"
        >
            {$t("homeThankYouFooter")}
        </footer>
    </div>
{/if}
