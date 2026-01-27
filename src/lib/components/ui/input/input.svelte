<script lang="ts">
    import type {
        HTMLInputAttributes,
        HTMLInputTypeAttribute,
    } from "svelte/elements";
    import { cn, type WithElementRef } from "$utils/index";

    type InputType = Exclude<HTMLInputTypeAttribute, "file">;

    type Props = WithElementRef<
        Omit<HTMLInputAttributes, "type"> &
            (
                | { type: "file"; files?: FileList }
                | { type?: InputType; files?: undefined }
            )
    >;

    let {
        ref = $bindable(null),
        value = $bindable(),
        type,
        files = $bindable(),
        class: className,
        "data-slot": dataSlot = "input",
        ...restProps
    }: Props = $props();
</script>

{#if type === "file"}
    <input
        bind:this={ref}
        data-slot={dataSlot}
        class={cn(
            "flex bg-transparent selection:bg-primary dark:bg-input/30 disabled:opacity-50 shadow-xs px-3 pt-1.5 border border-input rounded-md outline-none ring-offset-background w-full min-w-0 h-9 font-medium selection:text-primary-foreground placeholder:text-muted-foreground text-sm transition-[color,box-shadow] disabled:cursor-not-allowed",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            className,
        )}
        type="file"
        bind:files
        bind:value
        {...restProps}
    />
{:else}
    <input
        bind:this={ref}
        data-slot={dataSlot}
        class={cn(
            "flex bg-background selection:bg-primary dark:bg-input/30 disabled:opacity-50 shadow-xs px-3 py-1 border border-input rounded-md outline-none ring-offset-background w-full min-w-0 h-9 selection:text-primary-foreground placeholder:text-muted-foreground md:text-sm text-base transition-[color,box-shadow] disabled:cursor-not-allowed",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            className,
        )}
        {type}
        bind:value
        {...restProps}
    />
{/if}
