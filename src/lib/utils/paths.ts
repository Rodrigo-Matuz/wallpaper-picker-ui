import { BaseDirectory } from "@tauri-apps/plugin-fs";

// Custom folder at .config/
export const CONFIG_ROOT_DIR = "WallpaperPickerUI";

// Returns full path for .config folder
export const CONFIG_BASE_DIR = BaseDirectory.Config;

// Name for the config file
export const CONFIG_FILE_NAME = "config.json";

// WallpaperPickerUI/config.json
export const CONFIG_FILE_PATH = `${CONFIG_ROOT_DIR}/${CONFIG_FILE_NAME}`;

// Should be located at BaseDirectory.AppLocalData
export const THUMBNAILS_DIR = "thumbnails";
