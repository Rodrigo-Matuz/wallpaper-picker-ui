<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import { Button } from "$components/ui/button";
import { Input } from "$components/ui/input";
import { fetchConfig } from "$lib/api/config/read/read";
import { updateConfig } from "$lib/api/config/update/update";
import { t } from "$lib/lang/index";
import { log } from "$lib/utils/logger/logger";

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let inputPlaceholder: string = "Placeholder";

let inputValue = "";
let mustSave: "primary" | "destructive" = "primary";

const loadConfig = async () => {
	inputValue = (await fetchConfig()).command;
};

loadConfig();

function handleInputChange() {
	mustSave = "destructive";
}

async function handleSave() {
	mustSave = "primary";
	try {
		await updateConfig({ command: inputValue });
	} catch (error) {
		await log({
			level: "error",
			callStack: new Error(),
			message: `Failed to save command: ${error}`,
		});
	}
}
</script>

<SettingRow {name} {shortDescription} {hintDescription} stacked>
    {#snippet children(labelId, descriptionId)}
        <form class="flex min-w-0 flex-col gap-3 sm:flex-row" on:submit|preventDefault={handleSave}>
            <Input
                class="h-11 min-w-0 flex-1 rounded-none border-foreground/15 bg-background font-mono text-[13px]"
                placeholder={inputPlaceholder}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                bind:value={inputValue}
                oninput={handleInputChange}
            />
            <Button type="submit" size="sm" variant={mustSave === 'destructive' ? 'primary' : 'outline'} class="min-h-11 shrink-0">
                {$t('settings.command.button.text')}
            </Button>
        </form>
    {/snippet}
</SettingRow>
