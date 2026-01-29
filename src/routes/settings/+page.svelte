<script lang="ts">
    import { goto } from "$app/navigation";
    import { clearConfig } from "$api/config/clear";
    import { clearThumbnails } from "$api/thumbnails/clear";
    import { toggleDarkMode } from "$utils/darkMode";
    import { fetchConfig } from "$api/config/read";
    import { updateConfig } from "$api/config/update";
    import Navbar from "$components/navbar";
    import SettingsButton from "$components/settings/Button";
    import SettingsInput from "$components/settings/Input";
    import SettingsSelector from "$components/settings/Selector";
    import SettingsSwitch from "$components/settings/Switch";
    import Space from "$components/space";
    import { t } from "$lang/index";
    import { Smile, Undo2 } from "@lucide/svelte";
    // import UpdateHeader from "$components/update";
</script>

<Navbar
    leftIcon={Smile}
    leftOnClick={() => goto("/about")}
    disableInput={true}
    autoFocusInput={false}
    inputPlaceholder={$t("settingsSearchPlaceholder")}
    rightIcon={Undo2}
    rightOnClick={() => goto("/")}
/>

<!-- <UpdateHeader /> -->

<Space /><Space />

<SettingsInput
    name={$t("settingsCommandName")}
    shortDescription={$t("settingsCommandShortDescription")}
    inputPlaceholder={$t("settingsCommandInputPlaceholder")}
    hintDescription={$t("settingsCommandHintDescription")}
/>

<Space />

<SettingsSwitch
    name={$t("settingsDarkModeName")}
    shortDescription={$t("settingsDarkModeShortDescription")}
    fetchValue={async () => (await fetchConfig()).darkMode}
    onToggle={async () => await toggleDarkMode()}
    hintDescription={$t("settingsDarkModeHintDescription")}
/>

<Space />

<SettingsSwitch
    name={$t("settingsNewWallpapersName")}
    shortDescription={$t("settingsNewWallpapersShortDescription")}
    fetchValue={async () => (await fetchConfig()).newWallpapers}
    onToggle={async (checked) => await updateConfig({ newWallpapers: checked })}
    hintDescription={$t("settingsNewWallpapersHintDescription")}
/>

<Space />

<SettingsSelector
    name={$t("settingsLanguageName")}
    shortDescription={$t("settingsLanguageShortDescription")}
    selectorPlaceholder={$t("settingsLanguagePlaceholder")}
    hintDescription={$t("settingsLanguageHintDescription")}
/>

<Space />

<SettingsButton
    name={$t("settingsClearThumbnailsName")}
    shortDescription={$t("settingsClearThumbnailsShortDescription")}
    buttonName={$t("settingsClearThumbnailsButtonText")}
    buttonOnClick={clearThumbnails}
    hintDescription={$t("settingsClearThumbnailsHintDescription")}
/>

<Space />

<SettingsButton
    name={$t("settingsDeleteConfigName")}
    shortDescription={$t("settingsDeleteConfigShortDescription")}
    buttonName={$t("settingsDeleteConfigButtonText")}
    buttonOnClick={clearConfig}
    hintDescription={$t("settingsDeleteConfigHintDescription")}
/>

<Space larger={true} />
