<script lang="ts">
    import { cn, type WithElementRef } from "$utils/index";
    import type { HTMLAttributes } from "svelte/elements";

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
    bind:this={ref}
    data-slot="card-header"
    class={cn(
        "@container/card-header items-start gap-1.5 grid has-data-[slot=card-action]:grid-cols-[1fr_auto] grid-rows-[auto_auto] auto-rows-min px-6 [.border-b]:pb-6",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</div>
