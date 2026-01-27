<script lang="ts">
    import { Card, CardTitle } from "$components/ui/card";
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogHeader,
        DialogTitle,
        DialogTrigger,
    } from "$components/ui/dialog";
    import { Info } from "@lucide/svelte";
    import * as Select from "$components/ui/select";
    import { languages, setLanguage } from "$lang/index";

    export let name = "SettingsName";
    export let shortDescription = "Short Description";
    export let hintDescription = "Hint Description";
    export let selectorPlaceholder = "Placeholder";

    const availableLanguages = Object.keys(languages) as Array<
        keyof typeof languages
    >;

    let selectedLanguage = "";

    // Text shown inside Select.Trigger
    $: triggerLabel =
        languages[selectedLanguage as keyof typeof languages]?.name ??
        selectorPlaceholder;

    // React to changes
    $: if (selectedLanguage) {
        setLanguage(selectedLanguage as keyof typeof languages);
    }
</script>

<Card>
    <Dialog>
        <div class="p-10">
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-3">
                    <DialogTrigger>
                        <Info
                            class="text-primary hover:text-secondary cursor-pointer"
                            size={18}
                        />
                    </DialogTrigger>

                    <DialogContent class="bg-card">
                        <DialogHeader>
                            <DialogTitle class="text-primary text-2xl">
                                {name}
                            </DialogTitle>
                            <DialogDescription class="text-foreground text-md">
                                {@html hintDescription}
                            </DialogDescription>
                        </DialogHeader>
                    </DialogContent>

                    <CardTitle class="font-bold text-primary text-2xl">
                        {name}
                    </CardTitle>
                </div>

                <Select.Root type="single" bind:value={selectedLanguage}>
                    <Select.Trigger class="w-60">
                        {triggerLabel}
                    </Select.Trigger>

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

            <div class="flex justify-between">
                <p class="mt-4">{shortDescription}</p>
            </div>
        </div>
    </Dialog>
</Card>
