<script lang="ts">
    import { cn, type WithElementRef } from "$utils/index";
    import type { HTMLAttributes } from "svelte/elements";

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
