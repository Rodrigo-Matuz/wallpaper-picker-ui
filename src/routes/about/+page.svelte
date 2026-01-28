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

<Navbar
    leftIcon={House}
    leftOnClick={() => goto("/")}
    disableInput={true}
    inputPlaceholder={$t("aboutSearchPlaceholder")}
    rightIcon={Settings}
    rightOnClick={() => goto("/settings")}
/>

<Space larger={true} />

<DevProfile links={matuzLinks} githubUrl={matuz.githubUrl} />

<Space larger={true} />
