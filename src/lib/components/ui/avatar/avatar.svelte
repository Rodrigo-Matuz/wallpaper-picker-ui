<script lang="ts">
    import { Avatar as AvatarPrimitive } from "bits-ui";
    import { cn } from "$utils/index";

    let {
        ref = $bindable(null),
        loadingStatus = $bindable("loading"),
        class: className,
        ...restProps
    }: AvatarPrimitive.RootProps = $props();
</script>

<AvatarPrimitive.Root
    bind:ref
    bind:loadingStatus
    data-slot="avatar"
    class={cn(
        "relative flex rounded-full size-8 overflow-hidden shrink-0",
        className,
    )}
    {...restProps}
/>
