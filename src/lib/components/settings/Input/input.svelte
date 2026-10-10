<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import { Button } from "$components/ui/button";
import { Input } from "$components/ui/input";
import { fetchConfig } from "$lib/api/config/read/read";
import { updateConfig } from "$lib/api/config/update/update";
import { t } from "$lib/lang/index";
import { log } from "$lib/utils/logger/logger";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { runSettingsAction } from "../actions";
import { commandDraft } from "./commandDraft";

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let inputPlaceholder: string = "Placeholder";

const draft = commandDraft.state;
const installationReserved = applicationWork.installationReserved;
let inputValue = "";
$: inputValue = $draft.value;
$: mustSave = $draft.dirty ? "destructive" : "primary";

const loadConfig = async () => {
	const loading = commandDraft.capture();
	commandDraft.initialize((await fetchConfig()).command, loading.revision);
};

void runSettingsAction(loadConfig);

function handleInputChange() {
	try {
		commandDraft.edit(inputValue);
	} catch {
		inputValue = $draft.value;
		void runSettingsAction(() => false);
	}
}

async function handleSave() {
	const saved = commandDraft.capture();
	await runSettingsAction(async () => {
		if ($installationReserved) return false;
		try {
			const persisted = await updateConfig({ command: saved.value });
			if (persisted === true) commandDraft.confirmSaved(saved);
			return persisted === true;
		} catch (error) {
			await log({
				level: "error",
				callStack: new Error(),
				message: { context: "Failed to save command", error },
			});
			return false;
		}
	});
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
                disabled={$installationReserved}
                oninput={handleInputChange}
            />
            <Button type="submit" disabled={$installationReserved} size="sm" variant={mustSave === 'destructive' ? 'primary' : 'outline'} class="min-h-11 shrink-0">
                {$t('settings.command.button.text')}
            </Button>
        </form>
    {/snippet}
</SettingRow>
