<script lang="ts">
import Monitor from "@lucide/svelte/icons/monitor";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";
import X from "@lucide/svelte/icons/x";
import { tick } from "svelte";
import { t } from "$lang/index";
import WindowControls from "./window-controls.svelte";

let {
	inputPlaceholder = "",
	onInputChange = (_event: Event) => {},
}: {
	inputPlaceholder?: string;
	onInputChange?: (event: Event) => void;
} = $props();

const translate = $derived($t);
let monitorOpen = $state(false);
let monitorTrigger = $state<HTMLButtonElement>();
let closeButton = $state<HTMLButtonElement>();

async function openMonitorPanel() {
	monitorOpen = true;
	await tick();
	closeButton?.focus();
}

async function closeMonitorPanel() {
	monitorOpen = false;
	await tick();
	monitorTrigger?.focus();
}
</script>

<svelte:window onkeydown={(event) => { if (event.key === "Escape" && monitorOpen) void closeMonitorPanel(); }} />

<header class="sticky top-0 z-50 border-b border-foreground/15 bg-background/95 backdrop-blur-md">
	<nav class="mx-auto max-w-7xl theme-page-padding" aria-label="Wallpaper Picker UI">
		<div class="flex min-h-20 flex-wrap items-center gap-2 py-3 sm:gap-3" data-header-row data-tauri-drag-region>
			<button bind:this={monitorTrigger} type="button" aria-label={translate('home.monitors.title')} title={translate('home.monitors.title')} aria-controls="monitor-panel" aria-expanded={monitorOpen} class="theme-control flex size-10 shrink-0 items-center justify-center border border-foreground/15 text-muted transition-colors hover:border-primary hover:text-primary" onclick={openMonitorPanel}><Monitor class="size-4" /></button>
			<div class="hidden w-52 shrink-0 min-[800px]:block" data-tauri-drag-region>
				<p class="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-primary" data-tauri-drag-region>Wallpaper / Picker</p>
				<h1 class="truncate font-display text-xl leading-tight tracking-tight text-foreground" data-tauri-drag-region>Wallpaper Picker UI</h1>
			</div>
			<label class="flex min-w-0 flex-1 items-center gap-3 border border-foreground/15 bg-surface px-3 transition-colors focus-within:border-primary hover:border-foreground/30 max-[640px]:order-last max-[640px]:w-full max-[640px]:basis-full">
				<Search class="size-4 shrink-0 text-primary" />
				<!-- svelte-ignore a11y_autofocus -->
				<input type="search" data-home-search aria-label={inputPlaceholder || translate('home.search.placeholder')} class="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted" placeholder={inputPlaceholder || translate('home.search.placeholder')} autofocus oninput={onInputChange} />
			</label>
			<a href="/settings" aria-label={translate('settings.search.placeholder')} title={translate('settings.search.placeholder')} class="theme-control flex size-10 shrink-0 items-center justify-center border border-foreground/15 text-muted transition-colors hover:border-primary hover:text-primary"><Settings class="size-4" /></a>
			<WindowControls />
		</div>
	</nav>
</header>

{#if monitorOpen}
	<aside id="monitor-panel" aria-label={translate('home.monitors.title')} class="theme-card fixed inset-y-0 left-0 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col border-r border-foreground/15 bg-background p-5">
		<div class="flex items-start justify-between gap-4 border-b border-foreground/15 pb-4">
			<div>
				<p class="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Wallpaper / Picker</p>
				<h2 class="font-display text-xl text-foreground">{translate('home.monitors.title')}</h2>
			</div>
			<button bind:this={closeButton} type="button" aria-label={translate('home.monitors.close')} class="flex size-9 shrink-0 items-center justify-center border border-foreground/15 text-muted transition-colors hover:border-primary hover:text-primary" onclick={closeMonitorPanel}><X class="size-4" /></button>
		</div>
		<p class="mt-6 text-sm text-muted">{translate('home.monitors.coming.soon')}</p>
	</aside>
{/if}
