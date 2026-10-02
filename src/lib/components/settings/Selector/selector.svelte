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
import * as Select from "$components/ui/select";
import { languages, setLanguage } from "$lib/lang/index";

export let name = "SettingsName";
export let shortDescription = "Short Description";
export let hintDescription = "Hint Description";
export let selectorPlaceholder = "Placeholder";

const availableLanguages = Object.keys(languages) as Array<keyof typeof languages>;

let selectedLanguage = "";

$: triggerLabel =
	languages[selectedLanguage as keyof typeof languages]?.name ?? selectorPlaceholder;

$: if (selectedLanguage) {
	setLanguage(selectedLanguage as keyof typeof languages);
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
                <Select.Root type="single" bind:value={selectedLanguage}>
                    <div class="flex items-center gap-2">
                        <Select.Trigger class="w-full bg-surface border-border border rounded-md px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted outline-none transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary">
                            {triggerLabel}
                        </Select.Trigger>
                    </div>
                    <Select.Content>
                        <Select.Group>
                            {#each availableLanguages as lang (lang)}
                                <Select.Item
                                    value={lang}
                                    label={languages[lang].name}
                                >
                                    {languages[lang].name}
                                </Select.Item>
                            {/each}
                        </Select.Group>
                    </Select.Content>
                </Select.Root>
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
