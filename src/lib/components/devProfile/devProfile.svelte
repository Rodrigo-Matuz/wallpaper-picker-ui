<script lang="ts">
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import { onMount } from "svelte";
import { Avatar, AvatarFallback, AvatarImage } from "$components/ui/avatar";
import { t } from "$lang/index";
import type { ContributorLink, GitHubProfile } from "$types/devProfileTypes";

export let name = "";
export let links: ContributorLink[] = [];
export let githubUrl: string;
let profileData: GitHubProfile | null = null;
let unavailable = false;

$: username = githubUrl.replace(/\/+$/, "").split("/").pop() || name;
$: displayName = profileData?.name?.trim() || name || username;
$: headingId = `contributor-${username}`;
$: initials = displayName
	.split(/\s+/)
	.map((part) => part.charAt(0))
	.slice(0, 2)
	.join("")
	.toUpperCase();
const linkLabels: Record<string, string> = {
	website: "about.links.website",
	github: "about.links.github",
	discord: "about.links.discord",
	gmail: "about.links.email",
	kofi: "about.links.support",
};

onMount(() => {
	const controller = new AbortController();
	async function loadProfile() {
		try {
			const response = await fetch(`https://api.github.com/users/${username}`, {
				signal: controller.signal,
			});
			if (!response.ok) throw new Error("GitHub profile request failed");
			const data: GitHubProfile = await response.json();
			if (
				typeof data?.login !== "string" ||
				typeof data.avatar_url !== "string" ||
				(data.name !== null && typeof data.name !== "string") ||
				(data.bio !== null && typeof data.bio !== "string")
			)
				throw new Error("Invalid GitHub profile");
			if (!controller.signal.aborted) profileData = data;
		} catch {
			if (!controller.signal.aborted) unavailable = true;
		}
	}
	void loadProfile();
	return () => controller.abort();
});
</script>

<article aria-labelledby={headingId} class="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-5 gap-y-4 py-7 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-7 sm:py-8">
    <Avatar class="size-16 border border-foreground/15 sm:size-24">
        {#if profileData?.avatar_url}
            <AvatarImage src={profileData.avatar_url} alt={displayName} />
        {/if}
        <AvatarFallback class="bg-surface-raised font-display text-xl text-muted sm:text-3xl">{initials}</AvatarFallback>
    </Avatar>
    <div class="min-w-0 self-center">
        <h3 id={headingId} class="break-words font-display text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">{displayName}</h3>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex min-h-8 max-w-full items-center break-all font-mono text-[11px] text-muted transition-colors hover:text-success">
            @{profileData?.login || username}
        </a>
    </div>
    <div class="col-span-2 min-w-0 sm:col-start-2 sm:col-span-1">
        <p class="max-w-2xl break-words text-sm leading-7 text-muted">
            {#if profileData}
                {profileData.bio || $t('about.profile.contributor')}
            {:else if unavailable}
                {$t('about.profile.unavailable')}
            {:else}
                {$t('about.profile.info')}
            {/if}
        </p>
        {#if links.length > 0}
            <ul class="mt-2 flex flex-wrap gap-x-6 gap-y-1" aria-label={`${$t('about.profile.links')}: ${displayName}`}>
                {#each links as link (link.id)}
                    <li>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center gap-1.5 text-xs text-foreground transition-colors hover:text-success">
                            {$t(linkLabels[link.icon || link.id] || 'about.links.profile')}
                            <ArrowUpRight class="size-3 shrink-0 text-subtle" />
                        </a>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</article>
