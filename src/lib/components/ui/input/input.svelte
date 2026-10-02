<script lang="ts">
import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
import { cn, type WithElementRef } from "$utils/index";

type InputType = Exclude<HTMLInputTypeAttribute, "file">;

type Props = WithElementRef<
	Omit<HTMLInputAttributes, "type"> &
		({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
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

{#if type === 'file'}
    <input
        bind:this={ref}
        data-slot={dataSlot}
        class={cn(
            'flex bg-transparent disabled:opacity-50 px-3 pt-1.5 border border-border rounded-md outline-none w-full min-w-0 h-9 font-medium placeholder:text-muted text-sm transition-colors disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
            'aria-invalid:outline-destructive aria-invalid:opacity-70',
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
            'flex bg-surface hover:bg-surface-raised disabled:opacity-50 px-3 py-2 border border-border rounded-md outline-none w-full min-w-0 h-9 font-medium placeholder:text-muted text-base transition-colors disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
            'aria-invalid:outline-destructive aria-invalid:opacity-70',
            className,
        )}
        {type}
        bind:value
        {...restProps}
    />
{/if}
