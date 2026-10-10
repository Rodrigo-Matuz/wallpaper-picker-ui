<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import { Button } from "$components/ui/button";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { runSettingsAction } from "../actions";

const installationReserved = applicationWork.installationReserved;

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let buttonName: string = "BUTTON";
export let buttonOnClick: () => unknown;
export let destructive = false;
</script>

<SettingRow {name} {shortDescription} {hintDescription}>
    {#snippet children(labelId, descriptionId)}
        <div role="group" aria-labelledby={labelId} aria-describedby={descriptionId}>
            <Button disabled={$installationReserved} onclick={() => runSettingsAction(() => !$installationReserved && buttonOnClick())} size="sm" variant="outline" class={destructive ? 'min-h-11 whitespace-normal border-accent/35 text-accent hover:border-accent! hover:text-accent!' : 'min-h-11 whitespace-normal hover:border-accent! hover:text-accent!'}>
                {buttonName}
            </Button>
        </div>
    {/snippet}
</SettingRow>
