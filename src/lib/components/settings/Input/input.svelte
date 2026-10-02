<script lang="ts">
import { Info } from "@lucide/svelte";
import { Button } from "$components/ui/button";
import { Card, CardTitle } from "$components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "$components/ui/dialog";
import { Input } from "$components/ui/input";
import { fetchConfig } from "$lib/api/config/read";
import { updateConfig } from "$lib/api/config/update";
import { t } from "$lib/lang/index";
import { log } from "$lib/utils/logger";

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

<Card>
    <Dialog>
        <div class="p-6">
            <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                    <DialogTrigger>
                        <Info class="text-muted hover:text-primary cursor-pointer transition-colors" size={18} />
                    </DialogTrigger>
                    <CardTitle class="font-semibold text-lg leading-none text-foreground">
                        {name}
                    </CardTitle>
                </div>
                <Button onclick={handleSave} size="sm" variant={mustSave === 'destructive' ? 'outline' : 'primary'}>
                    {name}
                </Button>
            </div>
            <p class="mt-3 text-muted text-sm leading-relaxed">{shortDescription}</p>
        </div>
        <DialogContent class="bg-surface">
            <DialogHeader>
                <DialogTitle class="font-semibold text-lg text-foreground">
                    {name}
                </DialogTitle>
                <DialogDescription class="text-muted text-sm">
                    {@html hintDescription}
                </DialogDescription>
            </DialogHeader>
            <Input
                class="w-full mt-4"
                placeholder={inputPlaceholder}
                bind:value={inputValue}
                oninput={handleInputChange}
            />
        </DialogContent>
    </Dialog>
</Card>
