<script lang="ts">
    import { Avatar, AvatarFallback, AvatarImage } from "$components/ui/avatar";
    import type { GitHubProfile } from "src/types/devProfileTypes";
    import {
        Card,
        CardContent,
        CardDescription,
        CardFooter,
        CardHeader,
        CardTitle,
    } from "$components/ui/card";
    import { onMount } from "svelte";
    import { t } from "$lang/index";

    export let links: { id: string; url: string; icon: any }[] = [];
    export let githubUrl: string;
    let profileData: GitHubProfile | null = null;

    onMount(async () => {
        const username = githubUrl.split("/").pop();

        try {
            const response = await fetch(
                `https://api.github.com/users/${username}`,
            );
            profileData = await response.json();
        } catch (error) {
            console.error("Error fetching GitHub data:", error);
        }
    });
</script>

<Card class="flex-row p-4">
    <div class="flex-none grow">
        <CardHeader class="flex items-center">
            <CardTitle class="text-primary text-3xl"
                >{profileData
                    ? profileData.name
                    : $t("aboutDevProfileLoading")}</CardTitle
            >
            <CardDescription
                class="justify-self ml-3 text-1xl underline underline-offset-3"
            >
                @{profileData
                    ? profileData.login
                    : $t("aboutDevProfileLoading")}</CardDescription
            >
        </CardHeader>
        <CardContent class="my-3">
            <p>
                {profileData
                    ? profileData.bio
                    : $t("aboutDevProfileProfileInfo")}
            </p></CardContent
        >
        <CardFooter>
            {#if links.length > 0}
                <div class="flex space-x-4">
                    {#each links as link}
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="hover:text-secondary text-2xl"
                        >
                            <link.icon title="" />
                        </a>
                    {/each}
                </div>
            {/if}
        </CardFooter>
    </div>
    <div class="">
        <Avatar class="border w-30 h-30">
            {#if profileData}
                <AvatarImage src={profileData.avatar_url} />
            {:else}
                <AvatarFallback>PFP</AvatarFallback>
            {/if}
        </Avatar>
    </div>
</Card>
<div class="my-10"></div>
