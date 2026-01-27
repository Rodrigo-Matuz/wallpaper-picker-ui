<script lang="ts">
    import type { Separator as SeparatorPrimitive } from "bits-ui";
    import { Separator } from "$lib/components/ui/separator/index";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: SeparatorPrimitive.RootProps = $props();
</script>

<Separator
    bind:ref
    data-slot="select-separator"
    class={cn("-mx-1 my-1 bg-border h-px pointer-events-none", className)}
    {...restProps}
/>
