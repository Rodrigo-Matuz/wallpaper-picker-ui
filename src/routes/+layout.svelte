<script lang="ts">
import "./layout.css";
import { ModeWatcher, mode } from "mode-watcher";
import { onMount } from "svelte";
import { Toaster } from "$components/ui/sonner";
import GlobalUpdater from "$components/updating/global-updater.svelte";
import { t } from "$lang/index";
import { initializeApplicationSession } from "$utils/updating/session/runtime";

let { children } = $props();
const translate = $derived($t);
onMount(() => {
	void initializeApplicationSession();
});
</script>

<ModeWatcher defaultMode="dark" />
<GlobalUpdater>
	<Toaster theme={mode.current} position="bottom-center" richColors closeButtonAriaLabel={translate("updater.notice.dismiss")} containerAriaLabel={translate("updater.notice.notifications")} />
	{@render children()}
</GlobalUpdater>
