import type { ConfigInterArgs } from "$types/configTypes";

// TODO: Separate thumbnailsHashMap in it's own file
export const defaultConfig: ConfigInterArgs = {
	command: "",
	wallpapersPath: "",
	debugMode: false,
	newWallpapers: true,
	darkMode: true,
	language: "eng",
	thumbnailsHashMap: {},
	thumbnailVersion: 1,
};