<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import DevProfile from "$components/devProfile";
import contributorsConfig from "$config/contributors.json";
import { t } from "$lang/index";
import type { Contributor } from "$types/devProfileTypes";

const contributors: Contributor[] = contributorsConfig.contributors;
const projectWebsiteUrl = "https://matuz.dev/projects/wallpaper-picker";
const projectSourceUrl = "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui";
</script>

<div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-50 border-b border-foreground/10 bg-background">
        <nav aria-label={$t('about.search.placeholder')} class="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
            <a href="/" class="inline-flex min-h-11 items-center gap-2 text-xs text-muted transition-colors hover:text-success">
                <ArrowLeft class="size-4 shrink-0" />
                {$t('settings.back.label')}
            </a>
            <a href="/settings" class="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted transition-colors hover:text-success">
                {$t('settings.search.placeholder')}
                <ArrowUpRight class="size-3.5 shrink-0" />
            </a>
        </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-5 md:px-8">
        <header class="grid gap-6 border-b border-foreground/20 py-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:py-10">
            <div class="min-w-0">
                <p class="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{$t('about.search.placeholder')}</p>
                <h1 class="font-display text-[42px] leading-[1.05] tracking-tight text-foreground sm:text-5xl">Wallpaper Picker UI</h1>
                <p class="mt-4 max-w-lg text-sm leading-6 text-muted">{$t('about.project.description')}</p>
                <a href={projectWebsiteUrl} target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex min-h-11 items-center gap-2 text-xs text-foreground transition-colors hover:text-success">
                    {$t('about.project.website')}
                    <ArrowUpRight class="size-3.5 shrink-0" />
                </a>
            </div>
            <div class="border-l border-foreground/15 pl-4 sm:mb-1">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{$t('about.app.version')}</p>
                <p class="mt-1 font-mono text-xs text-foreground">{__APP_VERSION__}</p>
            </div>
        </header>

        <section aria-labelledby="contributors-heading" class="grid items-start gap-6 py-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:py-10">
            <div>
                <h2 id="contributors-heading" class="font-display text-3xl tracking-tight text-foreground">{$t('about.contributors.title')}</h2>
                <p class="mt-3 max-w-xs text-xs leading-6 text-muted">{$t('about.contributors.description')}</p>
            </div>
            <ul aria-label={$t('about.contributors.title')} class="min-w-0 divide-y divide-foreground/15 border-y border-foreground/15">
                {#each contributors as contributor (contributor.id)}
                    <li>
                        <DevProfile name={contributor.name} githubUrl={contributor.githubUrl} links={contributor.links} />
                    </li>
                {/each}
            </ul>
        </section>
    </main>

    <footer class="mx-auto w-full max-w-5xl px-5 pb-6 md:px-8">
        <div class="flex flex-col gap-3 border-t border-foreground/15 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div>
                <p class="text-xs font-medium text-foreground">{$t('about.contribute.title')}</p>
                <p class="mt-1 text-xs leading-5 text-muted">{$t('about.contribute.description')}</p>
            </div>
            <a href={projectSourceUrl} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 shrink-0 items-center gap-2 self-start text-xs text-foreground transition-colors hover:text-success sm:self-auto">
                {$t('about.project.source')}
                <ArrowUpRight class="size-3.5 shrink-0" />
            </a>
        </div>
    </footer>
</div>