<script lang="ts">
import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
import { Select as SelectPrimitive } from "bits-ui";
import { cn, type WithoutChild } from "$utils/index";

let {
	ref = $bindable(null),
	class: className,
	children,
	size = "default",
	...restProps
}: WithoutChild<SelectPrimitive.TriggerProps> & {
	size?: "sm" | "default";
} = $props();
</script>

<SelectPrimitive.Trigger
    bind:ref
    data-slot="select-trigger"
    data-size={size}
    class={cn(
        'border-border bg-surface hover:bg-surface-raised data-placeholder:text-muted [&_svg:not([class*="text-"])]:text-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary aria-invalid:outline-destructive aria-invalid:opacity-70 flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className,
    )}
    {...restProps}
>
    {@render children?.()}
    <ChevronDownIcon class="opacity-50 size-4" />
</SelectPrimitive.Trigger>
