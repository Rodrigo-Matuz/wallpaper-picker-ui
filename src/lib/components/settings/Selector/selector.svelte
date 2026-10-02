<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import * as Select from "$components/ui/select";
import { currentLanguage, languages, setLanguage } from "$lib/lang/index";

export let name = "SettingsName";
export let shortDescription = "Short Description";
export let hintDescription = "Hint Description";
export let selectorPlaceholder = "Placeholder";

const availableLanguages = Object.keys(languages);
$: triggerLabel = languages[$currentLanguage]?.name ?? selectorPlaceholder;
</script>

<SettingRow {name} {shortDescription} {hintDescription}>
    {#snippet children(labelId, descriptionId)}
        <Select.Root type="single" value={$currentLanguage} onValueChange={(value) => { if (value) setLanguage(value); }}>
            <Select.Trigger class="min-h-11 w-full min-w-0 rounded-none border-foreground/15 bg-background sm:w-48" aria-labelledby={labelId} aria-describedby={descriptionId}>
                <span class="truncate">{triggerLabel}</span>
            </Select.Trigger>
            <Select.Content>
                <Select.Group>
                    {#each availableLanguages as lang (lang)}
                        <Select.Item value={lang} label={languages[lang].name}>
                            {languages[lang].name}
                        </Select.Item>
                    {/each}
                </Select.Group>
            </Select.Content>
        </Select.Root>
    {/snippet}
</SettingRow>
