<script lang="ts">
    import { goto } from "$app/navigation";
    import DevProfile from "$components/devProfile";
    import Navbar from "$components/navbar";
    import Space from "$components/space";
    import { t } from "$lang/index";
    import { House, Settings } from "@lucide/svelte";
    import contributorsConfig from "$config/contributors.json";

    import {
        SiDiscord,
        SiGithub,
        SiGmail,
        SiKofi,
    } from "@icons-pack/svelte-simple-icons";

    const version = __APP_VERSION__;

    const iconMap = {
        github: SiGithub,
        discord: SiDiscord,
        gmail: SiGmail,
        kofi: SiKofi,
    } as const;

    const matuz = contributorsConfig.contributors.find((c) => c.id === "matuz");

    const matuzLinks = matuz.links.map((link) => ({
        ...link,
        icon: iconMap[link.icon],
    }));

</script>

<div class="flex flex-col min-h-screen">

    <Navbar
        leftIcon={House}
        leftOnClick={() => goto("/")}
        disableInput={true}
        inputPlaceholder={$t("aboutSearchPlaceholder")}
        rightIcon={Settings}
        rightOnClick={() => goto("/settings")}
    />

    <div class="flex flex-col justify-center items-center py-8 grow">
        <Space larger={true} />
        <DevProfile links={matuzLinks} githubUrl={matuz.githubUrl} />
    </div>

    <footer class="mt-auto py-3 border-t text-muted-foreground text-center">
        {$t("aboutAppVersion")} {version}
    </footer>
</div>