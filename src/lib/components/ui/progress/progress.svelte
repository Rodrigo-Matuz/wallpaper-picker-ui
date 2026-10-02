<script lang="ts">
import { Progress as ProgressPrimitive } from "bits-ui";
import { cn, type WithoutChildrenOrChild } from "$utils/index";

let {
	ref = $bindable(null),
	class: className,
	max = 100,
	value,
	...restProps
}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
</script>

<ProgressPrimitive.Root
    bind:ref
    data-slot="progress"
    class={cn(
        'relative bg-surface-hover/40 rounded-none w-full h-1 overflow-hidden border-border border',
        className,
    )}
    {value}
    {max}
    {...restProps}
>
    <div
        data-slot="progress-indicator"
        class="flex-1 bg-primary w-full h-full transition-all rounded-none"
        style="transform: translateX(-{100 -
            (100 * (value ?? 0)) / (max ?? 1)}%)"
    ></div>
</ProgressPrimitive.Root>
