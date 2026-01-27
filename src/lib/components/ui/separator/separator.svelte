<script lang="ts">
    import { Separator as SeparatorPrimitive } from "bits-ui";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        "data-slot": dataSlot = "separator",
        ...restProps
    }: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
    bind:ref
    data-slot={dataSlot}
    class={cn(
        "bg-border data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=horizontal]:h-px data-[orientation=vertical]:min-h-full shrink-0",
        className,
    )}
    {...restProps}
/>
