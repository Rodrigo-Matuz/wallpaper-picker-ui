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
    import { Switch } from "$components/ui/switch";
    import { onMount } from "svelte";

    export let name: string = "SettingsName";
    export let shortDescription: string = "Short Description";
    export let hintDescription: string = "Hint Description";
    export let fetchValue: () => Promise<boolean>;
    export let onToggle: (checked: boolean) => Promise<void>;

    let switchValue = true;

    const loadConfig = async () => {
        switchValue = await fetchValue();
    };

    onMount(loadConfig);
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
                    <CardTitle class="font-bold text-primary text-2xl">
                        {name}
                    </CardTitle>
                </div>
                <Switch
                    bind:checked={switchValue}
                    onCheckedChange={onToggle}
                    id={name.toLowerCase().replace(/\s+/g, "-")}
                />
            </div>
            <div class="flex justify-between">
                <p class="mt-4">{shortDescription}</p>
            </div>
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
        </div>
    </Dialog>
</Card>
