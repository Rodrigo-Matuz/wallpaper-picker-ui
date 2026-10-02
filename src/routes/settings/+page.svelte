<script lang="ts">
import { Smile, Undo2 } from "@lucide/svelte";
import { goto } from "$app/navigation";
import Navbar from "$components/navbar";
import SettingsButton from "$components/settings/Button";
import SettingsInput from "$components/settings/Input";
import SettingsSelector from "$components/settings/Selector";
import SettingsSwitch from "$components/settings/Switch";
import { clearConfig } from "$lib/api/config/clear";
import { fetchConfig } from "$lib/api/config/read";
import { updateConfig } from "$lib/api/config/update";
import { clearThumbnails } from "$lib/api/thumbnails/clear";
import { t } from "$lib/lang/index";
import { toggleDarkMode } from "$lib/utils/darkMode";

const translate = $derived($t);
</script>

<Navbar
    leftIcon={Smile}
    leftOnClick={() => goto('/about')}
    disableInput={true}
    autoFocusInput={false}
    inputPlaceholder={translate('settings.search.placeholder')}
    rightIcon={Undo2}
    rightOnClick={() => goto('/')}
/>

<div class="px-4 py-6 max-w-2xl mx-auto">
    <section class="flex flex-col gap-5">
        <SettingsInput
            name={translate('settings.command.name')}
            shortDescription={translate('settings.command.short.description')}
            inputPlaceholder={translate('settings.command.input.placeholder')}
            hintDescription={translate('settings.command.hint.description')}
        />

        <SettingsSwitch
            name={translate('settings.darkMode.name')}
            shortDescription={translate('settings.darkMode.short.description')}
            fetchValue={async () => (await fetchConfig()).darkMode}
            onToggle={async () => await toggleDarkMode()}
            hintDescription={translate('settings.darkMode.hint.description')}
        />

        <SettingsSwitch
            name={translate('settings.newWallpapers.name')}
            shortDescription={translate('settings.newWallpapers.short.description')}
            fetchValue={async () => (await fetchConfig()).newWallpapers}
            onToggle={async (checked) => await updateConfig({ newWallpapers: checked })}
            hintDescription={translate('settings.newWallpapers.hint.description')}
        />

        <SettingsSelector
            name={translate('settings.language.name')}
            shortDescription={translate('settings.language.short.description')}
            selectorPlaceholder={translate('settings.language.placeholder')}
            hintDescription={translate('settings.language.hint.description')}
        />

        <SettingsButton
            name={translate('settings.clearThumbnails.name')}
            shortDescription={translate('settings.clearThumbnails.short.description')}
            buttonName={translate('settings.clearThumbnails.button.text')}
            buttonOnClick={clearThumbnails}
            hintDescription={translate('settings.clearThumbnails.hint.description')}
        />

        <SettingsButton
            name={translate('settings.deleteConfig.name')}
            shortDescription={translate('settings.deleteConfig.short.description')}
            buttonName={translate('settings.deleteConfig.button.text')}
            buttonOnClick={clearConfig}
            hintDescription={translate('settings.deleteConfig.hint.description')}
        />
    </section>
</div>
