<script lang="ts">
import { Smile, Undo2 } from "@lucide/svelte";
import { clearConfig } from "$api/config/clear";
import { fetchConfig } from "$api/config/read";
import { updateConfig } from "$api/config/update";
import { clearThumbnails } from "$api/thumbnails/clear";
import { goto } from "$app/navigation";
import Navbar from "$components/navbar";
import SettingsButton from "$components/settings/Button";
import SettingsInput from "$components/settings/Input";
import SettingsSelector from "$components/settings/Selector";
import SettingsSwitch from "$components/settings/Switch";
import Space from "$components/space";
import { t } from "$lang/index";
import { toggleDarkMode } from "$utils/darkMode";
// import UpdateHeader from "$components/update";
</script>

<Navbar
    leftIcon={Smile}
    leftOnClick={() => goto("/about")}
    disableInput={true}
    autoFocusInput={false}
    inputPlaceholder={$t("settings.search.placeholder")}
    rightIcon={Undo2}
    rightOnClick={() => goto("/")}
/>

<!-- <UpdateHeader /> -->

<Space /><Space />

<SettingsInput
    name={$t("settings.command.name")}
    shortDescription={$t("settings.command.short.description")}
    inputPlaceholder={$t("settings.command.input.placeholder")}
    hintDescription={$t("settings.command.hint.description")}
/>

<Space />

<SettingsSwitch
    name={$t("settings.darkMode.name")}
    shortDescription={$t("settings.darkMode.short.description")}
    fetchValue={async () => (await fetchConfig()).darkMode}
    onToggle={async () => await toggleDarkMode()}
    hintDescription={$t("settings.darkMode.hint.description")}
/>

<Space />

<SettingsSwitch
    name={$t("settings.newWallpapers.name")}
    shortDescription={$t("settings.newWallpapers.short.description")}
    fetchValue={async () => (await fetchConfig()).newWallpapers}
    onToggle={async (checked) => await updateConfig({ newWallpapers: checked })}
    hintDescription={$t("settings.newWallpapers.hint.description")}
/>

<Space />

<SettingsSelector
    name={$t("settings.language.name")}
    shortDescription={$t("settings.language.short.description")}
    selectorPlaceholder={$t("settings.language.placeholder")}
    hintDescription={$t("settings.language.hint.description")}
/>

<Space />

<SettingsButton
    name={$t("settings.clearThumbnails.name")}
    shortDescription={$t("settings.clearThumbnails.short.description")}
    buttonName={$t("settings.clearThumbnails.button.text")}
    buttonOnClick={clearThumbnails}
    hintDescription={$t("settings.clearThumbnails.hint.description")}
/>

<Space />

<SettingsButton
    name={$t("settings.deleteConfig.name")}
    shortDescription={$t("settings.deleteConfig.short.description")}
    buttonName={$t("settings.deleteConfig.button.text")}
    buttonOnClick={clearConfig}
    hintDescription={$t("settings.deleteConfig.hint.description")}
/>

<Space larger={true} />
