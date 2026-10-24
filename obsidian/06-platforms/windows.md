---
title: Windows platform
updated: 2026-10-22
---

# Windows platform

The Windows build uses the current-user NSIS bundle configuration and a native mpv playback path with configured-command fallback. The Rust command passes media paths as process arguments for native playback.

The custom command path uses `cmd.exe` and platform-specific `$VP` escaping. The selected path may be outside application data because wallpaper directories are user-selected.

The Windows host verified Rust unit tests, frontend tests, checks, lint, and build. It did not verify a real desktop-shell mpv session, display changes, Explorer restart, sleep/wake, installer upgrade/reopen, or data preservation.