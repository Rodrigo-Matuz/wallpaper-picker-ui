---
title: Live Windows acceptance 2026-10-22
session: completed-slice
updated: 2026-10-22
---

# Live Windows acceptance

## Scope

This slice exercised the reviewed Tauri debug binary against the user-provided wallpaper directory. It focused on discovery, FFmpeg thumbnail generation, cache publication/reload, and the app-owned filesystem boundary. Desktop-shell rendering was intentionally not investigated after the user directed that mpv background rendering is not a current priority.

## Procedure and evidence

- Built a diagnostic no-bundle debug binary from the reviewed source with an alternate application identifier, preserving the repository source and normal build configuration.
- Temporarily set the external `WallpaperPickerUI/config.json` to:
  - `wallpapersPath`: `G:\Wallpapers`
  - `newWallpapers`: `true`
- Launched the diagnostic binary on Windows.
- The app discovered 178 supported media files.
- The app generated 178 nonempty PNG thumbnails in its app-owned thumbnail directory.
- `thumbnails/map.json` contained 178 entries.
- A programmatic readback verified:
  - 178 map entries;
  - 178 readable, nonempty thumbnail files;
  - zero missing source videos;
  - zero mapped paths outside `G:\Wallpapers`;
  - 178 supported media files discovered directly under the supplied library tree.
- Relaunched with discovery disabled. The saved thumbnail map was loaded and the grid rendered from cached previews.
- Selected a wallpaper tile. An `mpv.exe` process appeared with the selected file as its command-line title. Closing the app left no `mpv` process running.

## Cleanup and state

- Restored the external configuration to `wallpapersPath: G:\Wallpapers` and `newWallpapers: false`.
- Closed the diagnostic app and verified no diagnostic app or mpv process remained.
- Removed only scratch fixture/probe directories created during this acceptance work.
- No user wallpaper file was modified, moved, renamed, or deleted.
- No repository commit, reset, push, release, signing, or updater installation occurred.

## Limits

This is positive runtime evidence, not complete platform acceptance. It does not prove negative Tauri capability enforcement, Linux/NixOS behavior, malformed/missing/hung FFmpeg handling, desktop-shell background placement, Explorer restart recovery, monitor topology changes, sleep/wake recovery, or installer/updater acceptance. Those remain in the backlog.
