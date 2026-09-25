import type { LangCode } from "./langTypes";

export type ThumbnailRecord = Record<string, string>

export interface ConfigInterArgs {
  command: string;
  wallpapersPath: string;
  debugMode: boolean;
  newWallpapers: boolean,
  darkMode: boolean,
  language: LangCode,
  thumbnailsHashMap: ThumbnailRecord;
  /**
   * Version of the thumbnail naming scheme. Bumped by the app when the naming
   * changes so existing installs regenerate + clean up old thumbnail files.
   * Optional for configs created before this field existed.
   */
  thumbnailVersion?: number;
}
