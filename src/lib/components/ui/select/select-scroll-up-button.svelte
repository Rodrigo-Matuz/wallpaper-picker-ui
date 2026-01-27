<script lang="ts">
    import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
    import { Select as SelectPrimitive } from "bits-ui";
    import { cn, type WithoutChildrenOrChild } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props();
</script>

<SelectPrimitive.ScrollUpButton
    bind:ref
    data-slot="select-scroll-up-button"
    class={cn(
        "flex justify-center items-center py-1 cursor-default",
        className,
    )}
    {...restProps}
>
    <ChevronUpIcon class="size-4" />
</SelectPrimitive.ScrollUpButton>
