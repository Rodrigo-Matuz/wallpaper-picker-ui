---
title: Architecture decisions
updated: 2026-10-22
---

# Decisions

## Keep playback platform-specific

Linux retains configurable command playback. Windows may use the native mpv backend and configured fallback. A future provider must not force a shared rendering engine or change Linux behavior.

## Keep custom commands

The command setting is a deliberate feature for tools such as mpvpaper and scripts. The selected video path is escaped at the substitution boundary rather than removing shell support or pretending arbitrary user commands are sandboxed.

## Derive app-owned cache paths natively

A caller-supplied thumbnail directory created an avoidable native trust boundary. Tauri commands now derive `app_data_dir()/thumbnails`, while tests call internal directory-parameterized helpers with temporary directories.

## No premature Wallpaper Engine implementation

Wallpaper Engine integration is planning-only. The current code should keep discovery, thumbnails, and playback contracts separable, but must not add detection, settings, warnings, or CLI calls in this overhaul.
