import type { Icon } from "@lucide/svelte";

export type GitHubProfile = {
    name: string;
    login: string;
    bio: string;
    avatar_url: string;
};

export type DevProfileProps = {
    githubUrl: string;
    links?: {
        id: string;
        url: string;
        icon: Icon;
    }[];
};
