---
title: Frontend architecture
updated: 2026-10-22
---

# Frontend

The frontend uses Svelte 5 runes/stores with SvelteKit routing. `src/routes/+layout.svelte` establishes language/theme/application initialization; `src/routes/+page.svelte` owns the main library view. The UI is componentized under `src/lib/components/` and uses translation keys rather than hardcoded user-facing text.

## Native API wrappers

- `src/lib/api/config/` handles cached reads, ordered mutations, reset, and initialization.
- `src/lib/api/system/fetchVideos/` calls recursive Rust discovery.
- `src/lib/api/system/playback/` selects a platform backend and manages playback session state.
- `src/lib/api/system/execCommand/` invokes intentional user-configured commands.
- `src/lib/api/thumbnails/` handles generation, map persistence, recovery, cleanup, and Blob URL ownership.
- `src/lib/utils/applicationWork/` reserves work and prevents unsafe updater/shutdown overlap.

`ApiResult` wrappers convert native failures into UI-safe results and log structured diagnostics. Blob URLs are tracked and revoked by the thumbnail lifecycle instead of being left to the webview indefinitely.

## Constraints

Preserve the current theme registry, translations, layout, and keyboard/accessibility behavior. Avoid adding a rendering framework or virtualization dependency without measurements showing it is needed.
