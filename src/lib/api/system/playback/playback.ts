import { invoke, isTauri } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";
import { sendCommand } from "$api/system/execCommand/execCommand";
import { t } from "$lib/lang/index";
import { playbackBackendForPlatform } from "./backend";

export { playbackBackendForPlatform, type WallpaperPlaybackBackend } from "./backend";

/**
 * Applies a selected wallpaper using the platform backend.
 *
 * Windows first tries the native mpv/desktop-shell backend. If it is not
 * available, the configured command remains a compatibility fallback for
 * existing Windows installations. Linux and other platforms retain the
 * existing command behavior unchanged.
 */
export async function applyWallpaper(videoPath: string): Promise<void> {
	if (playbackBackendForPlatform() === "windows-native" && isTauri()) {
		try {
			await invoke("start_windows_playback", { videoPath });
			return;
		} catch (error) {
			toast.warning(get(t)("toast.windows.playback.fallback"));
			console.warn(
				"Native Windows wallpaper playback unavailable; using configured command",
				error,
			);
		}
	}

	await sendCommand(videoPath);
}
