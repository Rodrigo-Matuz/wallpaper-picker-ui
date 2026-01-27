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
    import { Button } from "$components/ui/button";

    export let name: string = "SettingsName";
    export let shortDescription: string = "Short Description";
    export let buttonName: string = "BUTTON";
    export let hintDescription: string = "Hint Description";
    export let buttonOnClick: () => {};
</script>

<Card
    ><Dialog>
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
                <Button onclick={buttonOnClick} size="sm">{buttonName}</Button>
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
    </Dialog></Card
>
