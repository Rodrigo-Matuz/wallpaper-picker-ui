<script lang="ts">
    import { onMount } from "svelte";
    import {
        checkForUpdates,
        getUpdateState,
        installUpdate,
    } from "$utils/updating";
    import { toast } from "svelte-sonner";

    let available = false;
    let version: string | undefined;
    let loading = false;

    onMount(async () => {
        const initial = getUpdateState();

        if (initial.state === "idle") {
            await checkForUpdates();
        }

        const status = getUpdateState();
        available = status.state === "available";
        version = status.update?.version;

        if (status.state === "error") {
            toast.error(
                "Failed to check for updates: " +
                    (status.error?.message ?? "Unknown error"),
            );
        }
    });

    async function handleUpdateClick() {
        if (loading) return;
        loading = true;

        try {
            await installUpdate();
        } catch {
            const { error } = getUpdateState();
            toast.error(
                "Update failed: " + (error?.message ?? "Unknown error"),
            );
            loading = false;
        }
    }
</script>

{#if available}
    <div
        role="button"
        tabindex="0"
        class="flex justify-center items-center bg-primary hover:bg-primary/90 disabled:opacity-60 px-4 min-h-8 text-primary-foreground text-sm transition-colors cursor-pointer disabled:pointer-events-none select-none"
        class:opacity-60={loading}
        class:pointer-events-none={loading}
        on:click={handleUpdateClick}
        on:keydown={(e) => e.key === "Enter" && handleUpdateClick()}
    >
        {#if loading}
            Installing update...
        {:else}
            Click here to update to newest version {version
                ? `(v${version})`
                : ""}
        {/if}
    </div>
{/if}
