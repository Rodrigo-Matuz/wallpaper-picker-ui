# Wallpaper Picker UI v3.6.5

## Wallpaper library and previews

- **New Wallpapers** now checks the selected folder for additions instead of regenerating saved thumbnails on every visit to Home. Cached previews appear while the scan runs; only new videos or missing thumbnail files need generation.
- Existing thumbnails remain visible during generation. A failed explicit rebuild retains the previous preview for videos that still have one.
- **Select Folder** has moved from Home to Settings. Selecting a folder scans it immediately, including when automatic discovery is off, without rebuilding previews that are already saved.

## Home and window controls

- Home cards show thumbnails without video filenames. The hover play icon now matches the blue thumbnail border.
- A refreshed Home header keeps wallpaper search and Settings prominent. Native minimize, maximize/restore, and close controls are available on Home, Settings, and About in the undecorated window.
- Folder and window-control labels are translated in all five supported languages.

## Updating and installation

Eligible **Windows x64, default-location, current-user NSIS** installations can check for this signed update in the app and install it with an explicit version-labelled Update click. The app does not automatically download, install, or restart. Pending work or unsaved Settings changes pause installation until you resolve them and retry.

Windows MSI installations require a manual migration to the NSIS `.exe` installer; the updater does not change installer types. Older app versions without in-app update controls also require a manual installation first. Linux AppImage updates remain manual; Debian/RPM and Nix/NixOS/Home Manager installations use their package or flake update path.

Back up your configuration and thumbnail/app-data folders before updating. Build and signature checks do not verify an actual installer restart or data-preserving upgrade in every environment.
