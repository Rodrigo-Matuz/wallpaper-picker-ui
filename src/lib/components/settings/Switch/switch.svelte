<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import { Switch } from "$components/ui/switch";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { runSettingsAction } from "../actions";

const installationReserved = applicationWork.installationReserved;

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let fetchValue: () => Promise<boolean>;
export let onToggle: (checked: boolean) => Promise<void | boolean>;

let switchValue = true;
let persistedValue = true;
let saving = false;

const loadConfig = async () => {
	switchValue = await fetchValue();
	persistedValue = switchValue;
};

void runSettingsAction(loadConfig);

async function handleToggle(checked: boolean) {
	saving = true;
	const success = await runSettingsAction(() => !$installationReserved && onToggle(checked));
	if (success) persistedValue = checked;
	else switchValue = persistedValue;
	saving = false;
}
</script>

<SettingRow {name} {shortDescription} {hintDescription}>
    {#snippet children(labelId, descriptionId)}
        <div class="flex min-h-11 items-center">
            <Switch disabled={$installationReserved || saving} bind:checked={switchValue} onCheckedChange={handleToggle} aria-labelledby={labelId} aria-describedby={descriptionId} />
        </div>
    {/snippet}
</SettingRow>
