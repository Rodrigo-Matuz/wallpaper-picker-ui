<script lang="ts">
    import { Dialog as DialogPrimitive } from "bits-ui";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: DialogPrimitive.OverlayProps = $props();
</script>

<DialogPrimitive.Overlay
    bind:ref
    data-slot="dialog-overlay"
    class={cn(
        "z-50 fixed inset-0 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
    )}
    {...restProps}
/>
