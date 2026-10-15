import type { LangCode } from "./langTypes";
import type { ThemeId, ThemeMode } from "./themeTypes";

export type ThumbnailRecord = Record<string, string>;

export interface ConfigInterArgs {
	command: string;
	wallpapersPath: string;
	debugMode: boolean;
	newWallpapers: boolean;
	darkMode: boolean;
	/** Selected theme family; missing in older configs defaults to DeepOcean. */
	themeId?: ThemeId;
	/** Selected theme appearance; missing in older configs follows darkMode. */
	themeMode?: ThemeMode;
	/** Missing in older configs means the controls remain visible. */
	showWindowControls?: boolean;
	language: LangCode;
	/** Legacy: kept for the one-time migration to thumbnails/map.json; cleared after migration. */
	thumbnailsHashMap?: ThumbnailRecord;
	/**
	 * Version of the thumbnail naming scheme. Bumped by the app when the naming
	 * changes so existing installs regenerate + clean up old thumbnail files.
	 * Optional for configs created before this field existed.
	 */
	thumbnailVersion?: number;
}
