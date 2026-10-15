import { isWindowsPlatform } from "$utils/platform/platform";

export type WallpaperPlaybackBackend = "windows-native" | "configured-command";

export function playbackBackendForPlatform(userAgent?: string): WallpaperPlaybackBackend {
	return isWindowsPlatform(userAgent) ? "windows-native" : "configured-command";
}
