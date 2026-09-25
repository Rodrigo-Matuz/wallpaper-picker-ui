<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "$utils/index";

let {
	ref = $bindable(null),
	class: className,
	children,
	...restProps
}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {} = $props();
</script>

<div
    bind:this={ref}
    data-slot="select-label"
    class={cn("px-2 py-1.5 text-muted-foreground text-xs", className)}
    {...restProps}
>
    {@render children?.()}
</div>
