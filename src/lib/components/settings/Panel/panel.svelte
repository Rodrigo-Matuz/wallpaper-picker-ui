<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import SettingsButton from "$components/settings/Button";
import SettingsInput from "$components/settings/Input";
import SettingsSelector from "$components/settings/Selector";
import SettingsSwitch from "$components/settings/Switch";
import { clearConfig } from "$lib/api/config/clear";
import { fetchConfig } from "$lib/api/config/read/read";
import { updateConfig } from "$lib/api/config/update/update";
import { clearThumbnails } from "$lib/api/thumbnails/clear";
import { t } from "$lib/lang/index";
import { toggleDarkMode } from "$lib/utils/darkMode";

const translate = $derived($t);
const sections = ["wallpaper", "preferences", "maintenance"] as const;
</script>

<header class="sticky top-0 z-50 border-b border-foreground/10 bg-background">
    <nav class="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-5 md:px-8" aria-label={translate('settings.search.placeholder')}>
        <a href="/" class="inline-flex min-h-11 items-center gap-2 text-xs text-muted transition-colors hover:text-foreground">
            <ArrowLeft class="size-4 shrink-0" />
            {translate('settings.back.label')}
        </a>
        <a href="/about" class="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground">
            {translate('about.search.placeholder')}
            <ArrowUpRight class="size-3.5 shrink-0" />
        </a>
    </nav>
</header>

<main class="mx-auto max-w-6xl px-5 pb-12 pt-8 md:px-8">
    <header class="mb-8 border-b border-foreground/15 pb-6">
        <h1 class="font-display text-4xl tracking-tight text-foreground">{translate('settings.search.placeholder')}</h1>
        <p class="mt-2 text-sm leading-6 text-muted">{translate('settings.page.description')}</p>
    </header>

    <div class="grid items-start gap-8 md:grid-cols-[144px_minmax(0,1fr)] md:gap-10">
        <aside class="md:sticky md:top-22">
            <nav aria-label={translate('settings.sections.label')} class="flex flex-wrap gap-x-5 gap-y-1 border-b border-foreground/10 pb-4 md:flex-col md:gap-1 md:border-0 md:pb-0">
                {#each sections as section, index (section)}
                    <a href={`#${section}`} class="flex min-h-11 items-center gap-3 text-[13px] text-muted transition-colors hover:text-foreground">
                        <span aria-hidden="true" class="font-mono text-[10px] text-subtle">{String(index + 1).padStart(2, '0')}</span>
                        {translate(`settings.section.${section}.title`)}
                    </a>
                {/each}
            </nav>
            <p class="mt-8 hidden border-t border-foreground/10 pt-4 font-mono text-[10px] leading-5 text-subtle md:block">
                {translate('about.app.version')}<br />{__APP_VERSION__}
            </p>
        </aside>

        <div class="min-w-0 space-y-9">
            <section id="wallpaper" aria-labelledby="wallpaper-heading" class="scroll-mt-20">
                <div class="mb-4">
                    <h2 id="wallpaper-heading" class="text-lg font-medium tracking-tight text-foreground">{translate('settings.section.wallpaper.title')}</h2>
                    <p class="mt-1 text-xs leading-5 text-muted">{translate('settings.section.wallpaper.description')}</p>
                </div>
                <div class="divide-y divide-foreground/10 border-y border-foreground/15 bg-surface">
                    <SettingsInput
                        name={translate('settings.command.name')}
                        shortDescription={translate('settings.command.short.description')}
                        inputPlaceholder={translate('settings.command.input.placeholder')}
                        hintDescription={translate('settings.command.hint.description')}
                    />
                    <SettingsSwitch
                        name={translate('settings.newWallpapers.name')}
                        shortDescription={translate('settings.newWallpapers.short.description')}
                        fetchValue={async () => (await fetchConfig()).newWallpapers}
                        onToggle={async (checked) => await updateConfig({ newWallpapers: checked })}
                        hintDescription={translate('settings.newWallpapers.hint.description')}
                    />
                </div>
            </section>

            <section id="preferences" aria-labelledby="preferences-heading" class="scroll-mt-20">
                <div class="mb-4">
                    <h2 id="preferences-heading" class="text-lg font-medium tracking-tight text-foreground">{translate('settings.section.preferences.title')}</h2>
                    <p class="mt-1 text-xs leading-5 text-muted">{translate('settings.section.preferences.description')}</p>
                </div>
                <div class="divide-y divide-foreground/10 border-y border-foreground/15 bg-surface">
                    <SettingsSwitch
                        name={translate('settings.darkMode.name')}
                        shortDescription={translate('settings.darkMode.short.description')}
                        fetchValue={async () => (await fetchConfig()).darkMode}
                        onToggle={async () => await toggleDarkMode()}
                        hintDescription={translate('settings.darkMode.hint.description')}
                    />
                    <SettingsSelector
                        name={translate('settings.language.name')}
                        shortDescription={translate('settings.language.short.description')}
                        selectorPlaceholder={translate('settings.language.placeholder')}
                        hintDescription={translate('settings.language.hint.description')}
                    />
                </div>
            </section>

            <section id="maintenance" aria-labelledby="maintenance-heading" class="scroll-mt-20">
                <div class="mb-4">
                    <h2 id="maintenance-heading" class="text-lg font-medium tracking-tight text-foreground">{translate('settings.section.maintenance.title')}</h2>
                    <p class="mt-1 text-xs leading-5 text-muted">{translate('settings.section.maintenance.description')}</p>
                </div>
                <div class="divide-y divide-foreground/10 border-y border-foreground/15 bg-surface">
                    <SettingsButton
                        name={translate('settings.clearThumbnails.name')}
                        shortDescription={translate('settings.clearThumbnails.short.description')}
                        buttonName={translate('settings.clearThumbnails.button.text')}
                        buttonOnClick={clearThumbnails}
                        hintDescription={translate('settings.clearThumbnails.hint.description')}
                    />
                    <SettingsButton
                        name={translate('settings.deleteConfig.name')}
                        shortDescription={translate('settings.deleteConfig.short.description')}
                        buttonName={translate('settings.deleteConfig.button.text')}
                        buttonOnClick={clearConfig}
                        hintDescription={translate('settings.deleteConfig.hint.description')}
                        destructive
                    />
                </div>
            </section>

            <p class="border-t border-foreground/10 pt-4 text-xs leading-6 text-subtle">{translate('settings.persistence.note')}</p>
        </div>
    </div>
</main>
