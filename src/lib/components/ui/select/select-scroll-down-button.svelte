<script lang="ts">
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import { Select as SelectPrimitive } from "bits-ui";
    import { cn, type WithoutChildrenOrChild } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps> = $props();
</script>

<SelectPrimitive.ScrollDownButton
    bind:ref
    data-slot="select-scroll-down-button"
    class={cn(
        "flex justify-center items-center py-1 cursor-default",
        className,
    )}
    {...restProps}
>
    <ChevronDownIcon class="size-4" />
</SelectPrimitive.ScrollDownButton>
