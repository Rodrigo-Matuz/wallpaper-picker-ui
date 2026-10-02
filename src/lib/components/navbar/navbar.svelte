<script lang="ts">
import { Info } from "@lucide/svelte";
import { Button } from "$components/ui/button";
import { t } from "$lang/index";

export let leftIcon = Info;
export let leftOnClick = () => {};
export let inputPlaceholder = "";
export let showInput = true;
export let autoFocusInput = false;
export let disableInput = true;
export let onInputChange = (_event: Event) => {};
export let rightIcon = Info;
export let rightOnClick = () => {};

const searchPlaceholder = inputPlaceholder || $t("home.search.placeholder");
</script>

<nav
    class="top-0 z-50 sticky flex items-center bg-background/80 backdrop-blur-sm border-b border-foreground/10 px-4 py-3 w-full"
>
    <div class="flex items-center gap-3 max-w-7xl mx-auto w-full">
        {#if leftIcon}
            <Button onclick={leftOnClick} variant="outline" size="sm" class="size-9 p-0!">
                <svelte:component this={leftIcon} class="size-5 shrink-0" />
            </Button>
        {/if}

        {#if showInput}
            <!-- svelte-ignore a11y_autofocus -->
            <input
                type="text"
                class="flex-1 bg-surface hover:bg-surface-raised px-3 py-1.5 border border-border rounded-md outline-none w-full min-w-0 text-base placeholder:text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={searchPlaceholder}
                autofocus={autoFocusInput}
                disabled={disableInput}
                on:input={onInputChange}
            />
        {/if}

        {#if rightIcon}
            <Button onclick={rightOnClick} variant="ghost" size="sm" class="size-9 p-0!">
                <svelte:component this={rightIcon} class="size-5 shrink-0" />
            </Button>
        {/if}
    </div>
</nav>
