<script lang="ts">
import "./layout.css";
import { ModeWatcher, mode } from "mode-watcher";
import { Toaster } from "$components/ui/sonner";

const { children } = $props();
</script>

<ModeWatcher defaultMode="dark" />
<Toaster theme={mode.current} position="bottom-center" richColors />

{@render children()}