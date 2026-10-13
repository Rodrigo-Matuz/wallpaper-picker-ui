<script lang="ts">
import Maximize2 from "@lucide/svelte/icons/maximize-2";
import Minimize2 from "@lucide/svelte/icons/minimize-2";
import Minus from "@lucide/svelte/icons/minus";
import X from "@lucide/svelte/icons/x";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onMount } from "svelte";
import { t } from "$lang/index";

const translate = $derived($t);
const native = isTauri();
let maximized = $state(false);

onMount(() => {
	if (native)
		void getCurrentWindow()
			.isMaximized()
			.then((value) => {
				maximized = value;
			});
});

async function toggleMaximize() {
	await getCurrentWindow().toggleMaximize();
	maximized = !maximized;
}
</script>

{#if native}
    <div class="flex shrink-0 items-center gap-0.5 border-l border-foreground/10 pl-2" role="group" aria-label="Window controls">
        <button type="button" aria-label={translate('home.window.minimize')} title={translate('home.window.minimize')} class="flex size-9 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-foreground" onclick={() => getCurrentWindow().minimize()}><Minus class="size-4" /></button>
        <button type="button" aria-label={translate(maximized ? 'home.window.restore' : 'home.window.maximize')} title={translate(maximized ? 'home.window.restore' : 'home.window.maximize')} class="flex size-9 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-primary" onclick={toggleMaximize}>
            {#if maximized}<Minimize2 class="size-4" />{:else}<Maximize2 class="size-4" />{/if}
        </button>
        <button type="button" aria-label={translate('home.window.close')} title={translate('home.window.close')} class="flex size-9 items-center justify-center text-muted transition-colors hover:bg-accent hover:text-white" onclick={() => getCurrentWindow().close()}><X class="size-4" /></button>
    </div>
{/if}
