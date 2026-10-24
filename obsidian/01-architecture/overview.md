---
title: Architecture overview
updated: 2026-10-22
---

# Architecture overview

Wallpaper Picker UI is a local-first Tauri desktop application. SvelteKit renders the UI and owns reactive state; Rust owns filesystem traversal, FFmpeg work, platform playback, update-support inspection, logging, and other native operations. The frontend communicates with Rust through typed-ish `invoke` wrappers rather than directly spawning processes.

## Main flow

1. Configuration is loaded and initialized in `src/routes/+layout.svelte` through the application session utilities.
2. `src/routes/+page.svelte` reads configuration, discovers videos, and coordinates thumbnail handling.
3. `src/lib/api/system/fetchVideos/` invokes `get_videos_list` for recursive media discovery.
4. `src/lib/api/thumbnails/handle.ts` coordinates map recovery, generation, persistence, Blob URLs, and cleanup.
5. Selecting a wallpaper routes through `src/lib/api/system/playback/`, which chooses Windows native playback or the configured command backend.

The app intentionally keeps discovery and preview management separate from playback execution so future playback providers do not need to change the UI contract.

## Important invariants

- User media stays in the selected directory and is never copied into the cache.
- Generated thumbnails belong under the Tauri app-data `thumbnails` directory.
- User-authored commands remain flexible, but selected media paths are escaped before shell execution.
- Updater installation is gated by platform/provenance policy, signature checks, and application-work ownership.
