<script lang="ts">
import { SiDiscord, SiGithub, SiGmail, SiKofi } from "@icons-pack/svelte-simple-icons";
import { Globe, House, Settings } from "@lucide/svelte";
import { goto } from "$app/navigation";
import DevProfile from "$components/devProfile";
import Navbar from "$components/navbar";
import Space from "$components/space";
import contributorsConfig from "$config/contributors.json";
import { t } from "$lang/index";

const version = __APP_VERSION__;

const iconMap = {
	website: Globe,
	github: SiGithub,
	discord: SiDiscord,
	gmail: SiGmail,
	kofi: SiKofi,
} as const;

const matuz = contributorsConfig.contributors.find((c) => c.id === "matuz")!;

const matuzLinks = matuz.links.map((link) => ({
	...link,
	icon: iconMap[link.icon as keyof typeof iconMap],
}));
</script>

<div class="flex flex-col min-h-screen">

    <Navbar
        leftIcon={House}
        leftOnClick={() => goto("/")}
        disableInput={true}
        inputPlaceholder={$t("about.search.placeholder")}
        rightIcon={Settings}
        rightOnClick={() => goto("/settings")}
    />

    <div class="flex flex-col justify-center items-center py-8 grow">
        <Space larger={true} />
        <DevProfile links={matuzLinks} githubUrl={matuz.githubUrl} />
    </div>

    <footer class="mt-auto py-3 border-t text-muted-foreground text-center">
        {$t("about.app.version")} {version}
    </footer>
</div>