<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "$utils/index";

let {
	ref = $bindable(null),
	class: className,
	children,
	...restProps
}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
    bind:this={ref}
    data-slot="card"
    class={cn(
        'flex flex-col gap-6 bg-surface border-border border rounded-md text-foreground shadow-none mx-0',
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</div>
