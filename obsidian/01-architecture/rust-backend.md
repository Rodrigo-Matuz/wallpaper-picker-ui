---
title: Rust backend architecture
updated: 2026-10-22
---

# Rust backend

`src-tauri/src/lib.rs` registers Tauri commands and initializes plugins/configuration. Native concerns are separated into modules:

- `get_videos_list`: recursive supported-video discovery with skipped-directory rules.
- `validate_video_paths`: filters stale paths before playback/thumbnail work.
- `generate_thumbnails`: bounded FFmpeg thumbnail work, deterministic names, and app-data output routing.
- `recover_thumbnails`: rebuilds an index from existing non-empty previews without generating media.
- `cleanup_thumbnails`: removes orphaned cache files while preserving `map.json` and listed previews.
- `send_command`: detached user-command execution with platform-specific path escaping.
- `windows_playback`: transitional native mpv desktop attachment on Windows.
- update/release modules: bounded release metadata and installer eligibility policy.

Blocking filesystem/process work is moved into `spawn_blocking` where the command is async. Rust tests use temporary directories and deterministic fixtures. Windows-only Win32 code remains behind platform modules and is not used by Linux playback.
