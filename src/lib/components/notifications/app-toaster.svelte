<script lang="ts">
import type { ToasterProps } from "svelte-sonner";
import { Toaster } from "$components/ui/sonner";

let { ...props }: ToasterProps = $props();
</script>

<!-- App palette adapter; keep the generated Sonner wrapper untouched. -->
<Toaster
    {...props}
    style="
        --normal-bg: var(--color-surface-raised);
        --normal-text: var(--color-foreground);
        --normal-border: var(--color-border);
        --normal-bg-hover: var(--color-surface-hover);
        --normal-border-hover: var(--color-primary);
        --info-bg: var(--color-surface-raised);
        --info-text: var(--color-foreground);
        --info-border: var(--color-primary);
        --success-bg: var(--color-surface-raised);
        --success-text: var(--color-foreground);
        --success-border: var(--color-success);
        --warning-bg: var(--color-surface-raised);
        --warning-text: var(--color-foreground);
        --warning-border: var(--color-warning);
        --error-bg: var(--color-surface-raised);
        --error-text: var(--color-foreground);
        --error-border: var(--color-accent);
        --action-bg: var(--color-primary);
        --action-text: var(--color-foreground);
        --action-hover-bg: var(--color-secondary);
    "
/>
