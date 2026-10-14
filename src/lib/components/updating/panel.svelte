<script lang="ts">
import { currentLanguage, t } from "$lang/index";
import { runtimeMode } from "$utils/updating/session/runtime";
import { updaterController } from "$utils/updating/updating";
import { categoryKeys, statusKeys, type UpdaterPanelController } from "./presentation";
import ReleaseNotes from "./release-notes.svelte";

let { controller = updaterController }: { controller?: UpdaterPanelController } = $props();
const translate = $derived($t);
const snapshotStore = $derived(controller.state);
const candidate = $derived($snapshotStore.availableUpdate);
const support = $derived($snapshotStore.support);
const legacyMsi = $derived(
	support?.mode === "manual-only" &&
		support.platform === "windows" &&
		support.installer === "msi" &&
		support.target === null,
);
const releaseNoticeOnly = $derived($snapshotStore.releaseNoticeOnly);
const linuxCheckFailure = $derived(
	support?.platform === "linux" && $snapshotStore.failure?.phase === "check",
);
const guidanceKey = $derived(
	support?.installer === "nix"
		? "updater.guidance.nix"
		: (releaseNoticeOnly || linuxCheckFailure) && support?.installer === "appimage"
			? "updater.guidance.appimage"
			: support?.mode === "package-managed"
				? "updater.guidance.managed"
				: support?.mode === "development" ||
						(!support && ($runtimeMode === "browser" || $runtimeMode === "development"))
					? "updater.guidance.development"
					: "updater.guidance.unavailable",
);
const statusKey = $derived(statusKeys[$snapshotStore.status]);
const manualLinux = $derived(
	releaseNoticeOnly || (support?.platform === "linux" && support.target === null),
);
const canCheckAgain = $derived(
	!$snapshotStore.busy &&
		$snapshotStore.canCheck &&
		(releaseNoticeOnly
			? $snapshotStore.status === "available" || $snapshotStore.status === "up-to-date"
			: $snapshotStore.status === "up-to-date" &&
				support?.mode === "self-managed" &&
				support.target !== null &&
				support.reason === "supported"),
);

function checkAgain() {
	if (!canCheckAgain) return;
	void controller.checkForUpdates();
}

function update() {
	if (manualLinux || legacyMsi || !candidate || !$snapshotStore.canUpdate) return;
	void controller.updateAndRestart({ confirmed: true, version: candidate.version });
}
</script>
<section aria-labelledby="updater-heading" class="grid gap-6 border-b border-foreground/15 py-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
	<h2 id="updater-heading" class="font-display text-3xl tracking-tight text-foreground">{translate("updater.title")}</h2>
	<div class="min-w-0 text-xs leading-6 text-muted">
		{#if statusKey && !$snapshotStore.failure && !$snapshotStore.installBlocked}
			<p role="status" aria-live="polite" aria-atomic="true">{releaseNoticeOnly && $snapshotStore.status === "available" && candidate ? translate("updater.notice.release.available").replace("{version}", candidate.version) : translate(statusKey)}</p>
		{/if}
		{#if $snapshotStore.status === "downloading"}
			<progress class="mt-3 h-1 w-full accent-success" aria-label={translate("updater.status.downloading")} max="100" aria-valuenow={$snapshotStore.progress?.percent ?? undefined} value={$snapshotStore.progress?.percent ?? undefined}></progress>
		{/if}
		{#if $snapshotStore.failure}
			<p role="status" aria-live="polite" aria-atomic="true" class="text-foreground">{translate(`updater.failure.${$snapshotStore.failure.phase}`)}</p>
			<p class="mt-2">{translate(`updater.error.${categoryKeys[$snapshotStore.failure.category]}`)}</p>
			{#if $snapshotStore.status === "error" && $snapshotStore.canRetry && !$snapshotStore.canUpdate}
				<button type="button" onclick={() => void controller.retry()} class="mt-3 min-h-11 border border-foreground/20 px-4 text-foreground hover:text-success">{translate("updater.action.retry")}</button>
			{/if}
		{/if}
		{#if $snapshotStore.status === "restart-required"}
			<p class="mt-2">{translate("updater.guidance.restart")}</p>
			{#if $snapshotStore.canRetry}
				<button type="button" onclick={() => void controller.retry()} class="mt-3 min-h-11 border border-foreground/20 px-4 text-foreground hover:text-success">{translate("updater.action.restart")}</button>
			{/if}
		{/if}
		{#if $snapshotStore.installBlocked}
			<p role="status" aria-live="polite" class="mt-3 text-foreground">{translate("updater.guidance.blocked")}</p>
		{/if}
		{#if candidate}
			<dl class="grid gap-4 font-mono sm:grid-cols-2">
				<div><dt class="text-[10px] uppercase tracking-[0.14em] text-subtle">{translate("updater.version.installed")}</dt><dd class="text-foreground">{$snapshotStore.currentVersion}</dd></div>
				<div><dt class="text-[10px] uppercase tracking-[0.14em] text-subtle">{translate("updater.version.available")}</dt><dd class="break-all text-success">{candidate.version}</dd></div>
			</dl>
			{#if candidate.body}
				<h3 class="mt-4 font-medium text-foreground">{translate("updater.notes")}</h3>
				{#key JSON.stringify([candidate.version, candidate.body])}
					<ReleaseNotes body={candidate.body} />
				{/key}
			{/if}
			{#if releaseNoticeOnly}
				<p class="mt-4 max-w-xl">{translate(guidanceKey)}</p>
			{:else if !manualLinux && !legacyMsi && $snapshotStore.canUpdate}
				<p id="update-consent" class="mt-4 max-w-xl">{translate("updater.consent")}</p>

			{:else if !legacyMsi && !$snapshotStore.busy && ($snapshotStore.status === "available" || $snapshotStore.status === "ready-to-install")}
				<p class="mt-4 max-w-xl">{translate("updater.guidance.manual")}</p>
			{/if}
		{:else if releaseNoticeOnly || linuxCheckFailure}
			<p class="mt-4 max-w-xl">{translate(guidanceKey)}</p>
		{:else if !legacyMsi && ($snapshotStore.status === "up-to-date" || $snapshotStore.failure?.phase === "check") && support?.mode === "manual-only"}
			<p class="mt-4 max-w-xl">{translate("updater.guidance.manual")}</p>
		{:else if !legacyMsi && !statusKey && !$snapshotStore.failure}
			<p>{translate(guidanceKey)}</p>
		{/if}
		{#if legacyMsi}
			<p class="mt-4 max-w-xl">{translate("updater.guidance.msi")}</p>
		{/if}
		{#if $snapshotStore.lastCheckedAt !== null}
			<div class="mt-4 text-[10px] text-subtle">
				<span>{translate("updater.checked.at")}</span>
				<time class="ml-2" datetime={new Date($snapshotStore.lastCheckedAt).toISOString()}>{new Date($snapshotStore.lastCheckedAt).toLocaleString($currentLanguage === "eng" ? "en" : $currentLanguage)}</time>
			</div>
		{/if}
		<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
			{#if candidate && !manualLinux && !legacyMsi && $snapshotStore.canUpdate}
				<button type="button" onclick={update} aria-describedby="update-consent" class="min-h-11 border border-success/40 px-4 font-mono text-xs text-success transition-colors hover:bg-success/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-success">{translate($snapshotStore.installBlocked ? "updater.action.resume" : "updater.action.update").replace("{version}", candidate.version)}</button>
			{/if}
			{#if canCheckAgain}
				<button type="button" onclick={checkAgain} class="min-h-11 border border-foreground/20 px-4 text-foreground hover:text-success">{translate("updater.action.check")}</button>
			{/if}
			<a href="https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center text-foreground hover:text-success">{translate("updater.releases")}</a>
		</div>
	</div>
</section>
