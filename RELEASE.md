# Wallpaper Picker UI v3.6.6

## Home and thumbnails

- Remove the offset focus outline from Home search; the input container's blue border remains the keyboard focus indicator.
- When **New Wallpapers** is off, Home displays saved previews without validating video paths or deleting their map entries. A missing/unreadable thumbnail map no longer causes a Home visit to clean up cached image files.

## Window controls

- Add **Show window controls** in Settings. Disable it to hide the app's minimize, maximize, and close buttons on Home, Settings, and About—for example, when using Hyprland. It is enabled by default for existing installations and applies immediately after saving.

## Updating and installation

Eligible **Windows x64, default-location, current-user NSIS** installations can check for this signed update and install it with an explicit Update click. The app does not automatically download, install, or restart. Pending work or unsaved Settings changes pause installation until resolved.

Windows MSI installations and older app versions without in-app update controls require manual installation; the updater does not change installer types. Linux AppImage updates remain manual. Debian/RPM and Nix/NixOS/Home Manager installations use their package or flake update path.

If the previous version already erased the saved thumbnail map, run a discovery scan once to regenerate it before turning **New Wallpapers** off again. Back up your configuration and thumbnail/app-data folders before updating. Installer restart and data preservation have not been verified on every supported environment.
