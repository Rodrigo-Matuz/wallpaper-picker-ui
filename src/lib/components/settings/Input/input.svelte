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
    import { Input } from "$components/ui/input";
    import { Button } from "$components/ui/button";
    import { fetchConfig } from "$api/config/read";
    import { updateConfig } from "$api/config/update";
    import { log } from "$utils/logger";
    import { t } from "$lang/index";

    export let name: string = "SettingsName";
    export let shortDescription: string = "Short Description";
    export let hintDescription: string = "Hint Description";
    export let inputPlaceholder: string = "Placeholder";

    let inputValue = "";
    let mustSave = "primary";

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
                <Input
                    class={`w-80 text-md bg-transparent border-0 border-b-2
                rounded-none border-primary focus-visible:ring-0 focus:outline-card 
                focus-visible:border-secondary outline-none focus-visible:border-b-secondary
                `}
                    oninput={handleInputChange}
                    placeholder={inputPlaceholder}
                    bind:value={inputValue}
                />
            </div>
            <div class="flex justify-between">
                <p class="mt-4">{shortDescription}</p>
                <Button
                    class="align-self-end mt-3 bg-{mustSave}"
                    onclick={handleSave}
                    size="sm">{$t("settingsCommandButtonText")}</Button
                >
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
