<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import * as Select from "$components/ui/select";
import { t } from "$lib/lang/index";
import {
	isThemeRoundnessValue,
	isThemeShadowStrengthValue,
	isThemeSpacingValue,
	themeAppearance,
} from "$lib/theme/appearance";
import { setThemeAppearance } from "$lib/theme/setThemeAppearance";
import type { ThemeRoundness, ThemeShadowStrength, ThemeSpacing } from "$types/themeTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";

const installationReserved = applicationWork.installationReserved;
const translate = $derived($t);
const appearance = $derived($themeAppearance);
let saving = $state(false);

const roundnessOptions = [
	{ value: "sharp", label: "settings.theme.roundness.option.sharp" },
	{ value: "soft", label: "settings.theme.roundness.option.soft" },
	{ value: "rounded", label: "settings.theme.roundness.option.rounded" },
	{ value: "pill", label: "settings.theme.roundness.option.pill" },
] as const;

const shadowOptions = [
	{ value: "none", label: "settings.theme.shadow.option.none" },
	{ value: "subtle", label: "settings.theme.shadow.option.subtle" },
	{ value: "strong", label: "settings.theme.shadow.option.strong" },
] as const;

const spacingOptions = [
	{ value: "compact", label: "settings.theme.spacing.option.compact" },
	{ value: "comfortable", label: "settings.theme.spacing.option.comfortable" },
	{ value: "spacious", label: "settings.theme.spacing.option.spacious" },
] as const;

async function updateRoundness(value: string | undefined) {
	if (!value || !isThemeRoundnessValue(value) || saving) return;
	saving = true;
	await setThemeAppearance({ roundness: value as ThemeRoundness });
	saving = false;
}

async function updateShadowStrength(value: string | undefined) {
	if (!value || !isThemeShadowStrengthValue(value) || saving) return;
	saving = true;
	await setThemeAppearance({ shadowStrength: value as ThemeShadowStrength });
	saving = false;
}

async function updateSpacing(value: string | undefined) {
	if (!value || !isThemeSpacingValue(value) || saving) return;
	saving = true;
	await setThemeAppearance({ spacing: value as ThemeSpacing });
	saving = false;
}
</script>

<SettingRow
	name={translate("settings.theme.roundness.name")}
	shortDescription={translate("settings.theme.roundness.short.description")}
	hintDescription={translate("settings.theme.roundness.hint.description")}
>
	{#snippet children(labelId, descriptionId)}
		<Select.Root
			disabled={$installationReserved || saving}
			type="single"
			value={appearance.roundness}
			onValueChange={updateRoundness}
		>
			<Select.Trigger
				class="theme-control min-h-11 w-full min-w-0 border-foreground/15 bg-background sm:w-56"
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
			>
				<span class="truncate">{translate(`settings.theme.roundness.option.${appearance.roundness}`)}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each roundnessOptions as option (option.value)}
						<Select.Item value={option.value} label={translate(option.label)}>
							{translate(option.label)}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{/snippet}
</SettingRow>

<SettingRow
	name={translate("settings.theme.shadow.name")}
	shortDescription={translate("settings.theme.shadow.short.description")}
	hintDescription={translate("settings.theme.shadow.hint.description")}
>
	{#snippet children(labelId, descriptionId)}
		<Select.Root
			disabled={$installationReserved || saving}
			type="single"
			value={appearance.shadowStrength}
			onValueChange={updateShadowStrength}
		>
			<Select.Trigger
				class="theme-control min-h-11 w-full min-w-0 border-foreground/15 bg-background sm:w-56"
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
			>
				<span class="truncate">{translate(`settings.theme.shadow.option.${appearance.shadowStrength}`)}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each shadowOptions as option (option.value)}
						<Select.Item value={option.value} label={translate(option.label)}>
							{translate(option.label)}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{/snippet}
</SettingRow>

<SettingRow
	name={translate("settings.theme.spacing.name")}
	shortDescription={translate("settings.theme.spacing.short.description")}
	hintDescription={translate("settings.theme.spacing.hint.description")}
>
	{#snippet children(labelId, descriptionId)}
		<Select.Root
			disabled={$installationReserved || saving}
			type="single"
			value={appearance.spacing}
			onValueChange={updateSpacing}
		>
			<Select.Trigger
				class="theme-control min-h-11 w-full min-w-0 border-foreground/15 bg-background sm:w-56"
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
			>
				<span class="truncate">{translate(`settings.theme.spacing.option.${appearance.spacing}`)}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each spacingOptions as option (option.value)}
						<Select.Item value={option.value} label={translate(option.label)}>
							{translate(option.label)}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{/snippet}
</SettingRow>
