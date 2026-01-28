<script>
    import { Button } from "$components/ui/button";
    import { Info } from "@lucide/svelte";

    export let leftIcon = Info;
    export let leftOnClick = () => {};

    export let inputPlaceholder = "Search...";
    export let showInput = true;
    export let autoFocusInput = false;
    export let disableInput = true;

    // TODO: Ugly
    export let onInputChange = (/** @type {any} */ _event) => {};

    export let rightIcon = Info;
    export let rightOnClick = () => {};
</script>

<nav
    class="top-0 z-50 sticky flex justify-between items-center bg-card shadow-md p-2 w-full"
>
    {#if leftIcon}
        <Button onclick={leftOnClick} size="sm" class="w-12">
            <svelte:component this={leftIcon} class="size-6" />
        </Button>
    {/if}

    {#if showInput}
        <!-- svelte-ignore a11y_autofocus -->
        <input
            type="text"
            class="bg-transparent shadow-none py-0.75 border-2 border-transparent border-b-transparent focus-visible:border-b-accent rounded-none outline-none focus-visible:ring-0 w-full max-w-104 text-2xl text-center leading-none caret-primary disabled:cursor-not-allowed"
            placeholder={inputPlaceholder}
            autofocus={autoFocusInput}
            disabled={disableInput}
            on:input={onInputChange}
        />
    {/if}

    {#if rightIcon}
        <Button onclick={rightOnClick} size="sm" class="w-12">
            <svelte:component this={rightIcon} class="size-6" />
        </Button>
    {/if}
</nav>
