export type GitHubProfile = {
	name: string | null;
	login: string;
	bio: string | null;
	avatar_url: string;
};

export type ContributorLink = {
	id: string;
	url: string;
	icon?: string;
};

export type Contributor = {
	id: string;
	name: string;
	githubUrl: string;
	links: ContributorLink[];
};

export type DevProfileProps = Pick<Contributor, "name" | "githubUrl"> & {
	links?: ContributorLink[];
};
