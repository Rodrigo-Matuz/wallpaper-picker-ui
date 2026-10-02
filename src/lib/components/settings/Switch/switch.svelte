<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import { Switch } from "$components/ui/switch";

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let fetchValue: () => Promise<boolean>;
export let onToggle: (checked: boolean) => Promise<void>;

let switchValue = true;

const loadConfig = async () => {
	switchValue = await fetchValue();
};

loadConfig();
</script>

<SettingRow {name} {shortDescription} {hintDescription}>
    {#snippet children(labelId, descriptionId)}
        <div class="flex min-h-11 items-center">
            <Switch bind:checked={switchValue} onCheckedChange={onToggle} aria-labelledby={labelId} aria-describedby={descriptionId} />
        </div>
    {/snippet}
</SettingRow>
