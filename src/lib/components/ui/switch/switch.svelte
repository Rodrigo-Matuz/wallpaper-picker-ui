<script lang="ts">
import { Switch as SwitchPrimitive } from "bits-ui";
import { cn, type WithoutChildrenOrChild } from "$utils/index";

let {
	ref = $bindable(null),
	class: className,
	checked = $bindable(false),
	...restProps
}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();
</script>

<SwitchPrimitive.Root
    bind:ref
    bind:checked
    data-slot="switch"
    class={cn(
        'peer inline-flex items-center data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface-hover disabled:opacity-50 border border-transparent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary rounded-full outline-none w-10 h-6 p-0.5 transition-colors duration-150 ease-out motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed shrink-0',
        className,
    )}
    {...restProps}
>
    <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        class={cn(
            'block shrink-0 bg-foreground rounded-full ring-0 size-4.5 transition-transform duration-150 ease-out motion-reduce:transition-none data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 pointer-events-none',
        )}
    />
</SwitchPrimitive.Root>
