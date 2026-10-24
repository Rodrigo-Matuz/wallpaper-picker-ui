# Future Wallpaper Engine integration

> **PLANNED — NOT IMPLEMENTED**

This document records a possible future integration with Wallpaper Engine. It is not a promise of support, and no Wallpaper Engine discovery, parsing, playback, process control, or workshop integration exists in the current application.

## Current boundary

The current app selects local video files, generates app-owned thumbnail files, and routes playback through the existing platform-specific backends:

- Linux and macOS use the configured user-authored command.
- Windows uses the existing native mpv playback path when available, with the documented fallback behavior.
- Wallpaper directories remain user-selected filesystem locations.
- Generated thumbnails and the thumbnail map remain inside the application data directory.

Do not infer Wallpaper Engine support from any of these existing paths.

## Possible future scope

If support is pursued, investigate the smallest useful read-only slice first:

1. Detect an explicitly selected Wallpaper Engine project directory.
2. Parse only the documented project metadata needed to identify a preview and playable asset.
3. Represent the project as a local wallpaper reference without copying, renaming, or modifying the user's files.
4. Generate thumbnails into the existing app-owned cache using the same map and cleanup invariants as ordinary videos.
5. Keep playback behind a separate native/backend adapter rather than embedding Wallpaper Engine assumptions in the generic video scanner.

## Questions that must be answered before implementation

- Which Wallpaper Engine installation and project layouts are supported on each target OS?
- Can a project be rendered or played without launching Steam, Wallpaper Engine, or an untrusted helper process?
- What licensing, workshop, asset-distribution, and reverse-engineering constraints apply?
- How are project-relative assets resolved safely without allowing traversal outside the selected project root?
- Which media formats and scene types can be represented as a local preview without pretending that unsupported interactive scenes are videos?
- What happens when a project, dependency, or Steam library is unavailable offline?
- Can the feature remain opt-in and fail closed without changing existing local-video behavior?

## Security and preservation requirements

Any future implementation must preserve these boundaries:

- Treat project metadata and asset paths as untrusted input.
- Canonicalize and validate project-relative paths before opening them.
- Never execute project scripts, shaders, binaries, or workshop code as part of discovery.
- Never copy, move, rename, or modify user media.
- Keep generated thumbnails and destructive cleanup scoped to app-owned storage.
- Keep user-authored custom commands separate from any Wallpaper Engine adapter.
- Add focused tests for traversal, malformed metadata, missing assets, unsupported scene types, and cleanup recovery before adding UI.
- Document real platform/runtime verification separately from unit-test coverage.

## Explicit non-goals for this overhaul

The current overhaul does **not** implement Wallpaper Engine support, Steam integration, project parsing, scene rendering, workshop access, or a new playback architecture. Revisit this note only after the local-first video workflow and existing platform backends are stable and verified.
