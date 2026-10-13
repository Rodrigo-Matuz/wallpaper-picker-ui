# Wallpaper Picker UI v3.6.6 — draft (unreleased)

## Home and thumbnails

- Remove the offset focus outline from Home search; the input container's blue border remains the keyboard focus indicator.
- When **New Wallpapers** is off, Home displays saved previews without validating video paths or deleting their map entries. A missing/unreadable thumbnail map no longer causes a Home visit to clean up cached image files.

## Window controls

- Add **Show window controls** in Settings. Disable it to hide the app's minimize, maximize, and close buttons on Home, Settings, and About—for example, when using Hyprland. It is enabled by default for existing installations and applies immediately after saving.

This is a draft for a future update, not a published release. Existing users whose cached map was already cleared by the old behavior may need one discovery scan to regenerate it.
