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
}
