---
title: Wallpaper playback
updated: 2026-10-22
---

# Wallpaper playback

## Verified behavior

`src/lib/api/system/playback/playback.ts` routes selected media by platform:

- Windows in the Tauri runtime tries `start_windows_playback` first.
- If native Windows playback fails, the configured command is used as a compatibility fallback.
- Linux and other platforms use the configured command directly.

The configured command is user-authored. `$VP` substitution is escaped by the Rust command boundary for the active shell.

## Verification

The frontend routing tests cover Windows-native routing and Linux/macOS command routing. Rust tests cover Windows mpv argument construction without a shell wrapper.

A real desktop playback smoke test, Explorer restart, display-change, sleep/wake, and mpv cleanup test remain platform acceptance work.