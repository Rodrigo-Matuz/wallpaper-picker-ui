<script lang="ts">
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

export let name: string = "SettingsName";
export let shortDescription: string = "Short Description";
export let hintDescription: string = "Hint Description";
export let buttonName: string = "BUTTON";
export let buttonOnClick: () => {};
</script>

<Card>
    <Dialog>
        <div class="p-6">
            <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                    <DialogTrigger>
                        <span class="cursor-pointer">
                            <CardTitle class="font-semibold text-lg leading-none text-foreground">
                                {name}
                            </CardTitle>
                        </span>
                    </DialogTrigger>
                </div>
                <Button onclick={buttonOnClick} size="sm" variant="primary">
                    {buttonName}
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
        </DialogContent>
    </Dialog>
</Card>
