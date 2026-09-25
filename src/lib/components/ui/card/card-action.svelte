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
    data-slot="card-action"
    class={cn(
        "justify-self-end self-start col-start-2 row-span-2 row-start-1",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</div>
