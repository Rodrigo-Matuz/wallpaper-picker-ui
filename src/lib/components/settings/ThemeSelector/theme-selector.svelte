<script lang="ts">
import SettingRow from "$components/settings/Row/row.svelte";
import * as Select from "$components/ui/select";
import { t } from "$lib/lang/index";
import { getThemeVariant, themeIds, themes } from "$lib/theme/registry";
import { setThemeFamily } from "$lib/theme/setThemeFamily";
import { themeSelection } from "$lib/theme/theme";
import type { ThemeId } from "$types/themeTypes";
import { applicationWork } from "$utils/applicationWork/applicationWork";

const installationReserved = applicationWork.installationReserved;
const translate = $derived($t);
const selection = $derived($themeSelection);
let saving = $state(false);

async function handleThemeChange(value: string | undefined) {
	if (!value || !(value in themes) || saving) return;
	saving = true;
	await setThemeFamily(value as ThemeId);
	saving = false;
}
</script>

<SettingRow
	name={translate("settings.theme.family.name")}
	shortDescription={translate("settings.theme.family.short.description")}
	hintDescription={translate("settings.theme.family.hint.description")}
>
	{#snippet children(labelId, descriptionId)}
		<Select.Root
			disabled={$installationReserved || saving}
			type="single"
			value={selection.themeId}
			onValueChange={handleThemeChange}
		>
			<Select.Trigger
				class="theme-control min-h-11 w-full min-w-0 border-foreground/15 bg-background sm:w-56"
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
			>
				<span class="flex min-w-0 items-center gap-2 truncate">
					<span
						class="size-2.5 shrink-0 border border-foreground/20"
						style={`background-color: ${getThemeVariant(selection.themeId, selection.mode).colors.primary}`}
					></span>
					{translate(themes[selection.themeId].labelKey)}
				</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each themeIds as themeId (themeId)}
						{@const variant = getThemeVariant(themeId, selection.mode)}
						<Select.Item value={themeId} label={translate(themes[themeId].labelKey)}>
							<span class="flex items-center gap-2">
								<span
									class="size-2.5 border border-foreground/20"
									style={`background: linear-gradient(135deg, ${variant.colors.primary}, ${variant.colors.accent})`}
								></span>
								{translate(themes[themeId].labelKey)}
							</span>
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{/snippet}
</SettingRow>
