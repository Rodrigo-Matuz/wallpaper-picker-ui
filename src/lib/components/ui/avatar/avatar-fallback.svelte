<script lang="ts">
    import { Avatar as AvatarPrimitive } from "bits-ui";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: AvatarPrimitive.FallbackProps = $props();
</script>

<AvatarPrimitive.Fallback
    bind:ref
    data-slot="avatar-fallback"
    class={cn(
        "flex justify-center items-center bg-muted rounded-full size-full",
        className,
    )}
    {...restProps}
/>
