<script lang="ts">
import Search from "@lucide/svelte/icons/search";
import Settings2 from "@lucide/svelte/icons/settings-2";
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
</script>

<header class="sticky top-0 z-50 border-b border-foreground/15 bg-background/95 backdrop-blur-md">
    <nav class="mx-auto max-w-7xl px-5 md:px-8" aria-label="Wallpaper Picker UI">
        <div class="flex min-h-16 items-center gap-3 border-b border-foreground/10" data-tauri-drag-region>
            <div class="min-w-0 flex-1 py-2" data-tauri-drag-region>
                <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-primary" data-tauri-drag-region>Wallpaper / Picker</p>
                <h1 class="truncate font-display text-xl leading-tight tracking-tight text-foreground" data-tauri-drag-region>Wallpaper Picker UI</h1>
            </div>
            <a href="/settings" aria-label={translate('settings.search.placeholder')} title={translate('settings.search.placeholder')} class="flex size-10 shrink-0 items-center justify-center border border-foreground/15 text-muted transition-colors hover:border-primary hover:text-primary"><Settings2 class="size-4" /></a>
            <WindowControls />
        </div>
        <div class="flex items-center gap-3 py-3">
            <label class="flex min-w-0 flex-1 items-center gap-3 border border-foreground/15 bg-surface px-3 transition-colors focus-within:border-primary hover:border-foreground/30">
                <Search class="size-4 shrink-0 text-primary" />
                <!-- svelte-ignore a11y_autofocus -->
                <input type="search" aria-label={inputPlaceholder || translate('home.search.placeholder')} class="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted" placeholder={inputPlaceholder || translate('home.search.placeholder')} autofocus oninput={onInputChange} />
            </label>
        </div>
    </nav>
</header>
