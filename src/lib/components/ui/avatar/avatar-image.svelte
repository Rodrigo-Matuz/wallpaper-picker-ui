<script lang="ts">
    import { Avatar as AvatarPrimitive } from "bits-ui";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        class: className,
        ...restProps
    }: AvatarPrimitive.ImageProps = $props();
</script>

<AvatarPrimitive.Image
    bind:ref
    data-slot="avatar-image"
    class={cn("size-full aspect-square", className)}
    {...restProps}
/>
