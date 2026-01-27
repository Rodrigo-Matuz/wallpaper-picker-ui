<script lang="ts">
    import { goto } from "$app/navigation";
    import DevProfile from "$components/devProfile";
    import Navbar from "$components/navbar";
    import Space from "$components/space";
    import { t } from "$lang/index";
    import { House, Settings } from "@lucide/svelte";
    import {
        SiDiscord,
        SiGithub,
        SiGmail,
    } from "@icons-pack/svelte-simple-icons";

    // TODO: move this somewhere else
    const matuzLinks = [
        {
            id: "1",
            url: "https://github.com/Rodrigo-Matuz",
            icon: SiGithub,
        },
        {
            id: "2",
            url: "https://discordapp.com/users/584503954969198612",
            icon: SiDiscord,
        },
        {
            id: "3",
            url: "mailto:matuzuera@gmail.com",
            icon: SiGmail,
        },
    ];
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

<DevProfile links={matuzLinks} githubUrl="https://github.com/Rodrigo-Matuz" />

<Space larger={true} />
