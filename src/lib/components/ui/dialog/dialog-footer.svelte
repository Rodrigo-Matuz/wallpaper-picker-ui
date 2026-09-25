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
    data-slot="dialog-footer"
    class={cn(
        "flex sm:flex-row flex-col-reverse sm:justify-end gap-2",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</div>
