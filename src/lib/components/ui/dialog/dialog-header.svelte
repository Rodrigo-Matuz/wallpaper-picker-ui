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
    data-slot="dialog-header"
    class={cn('flex flex-col gap-1.5 text-center sm:text-start', className)}
    {...restProps}
>
    {@render children?.()}
</div>
