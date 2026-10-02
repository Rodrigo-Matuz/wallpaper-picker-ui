<script lang="ts">
import { Info } from "@lucide/svelte";
import { Card, CardTitle } from "$components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "$components/ui/dialog";
import { Switch } from "$components/ui/switch";
import { t } from "$lib/lang/index";

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
                <Switch bind:checked={switchValue} onCheckedChange={onToggle} />
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
        </DialogContent>
    </Dialog>
</Card>
