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
        'peer inline-flex items-center data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface-hover dark:data-[state=unchecked]:bg-surface-hover disabled:opacity-50 border border-transparent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary rounded-md outline-none w-10 h-[1.2rem] transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0',
        className,
    )}
    {...restProps}
>
    <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        class={cn(
            'block bg-foreground dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground rounded-md ring-0 size-4 transition-transform data-[state=checked]:translate-x-[calc(100%-3px)] data-[state=unchecked]:translate-x-0 pointer-events-none',
        )}
    />
</SwitchPrimitive.Root>
