---
title: Backlog
updated: 2026-10-23
---

# Backlog

## High priority verification

- Keep Graphify refreshed after future source changes; the current artifact records 2,240 nodes, 3,970 extraction edges, 3,858 clustered edges, and 99 communities.
- Positive packaged/native capability/runtime probe completed for the actual debug Tauri window and scoped app-owned thumbnail paths. A Rust generated-ACL probe also covers allowed commands, wrong-window scope, an unused command, and the removed opener command; live packaged frontend IPC enforcement remains future verification.
- Real FFmpeg acceptance for missing executable, malformed media, empty media, short-video fallback, and the Windows frontend/native fixture scan is complete. The bounded runner's timeout kill/wait path passes; a full 30-second hung-decoder acceptance remains optional future verification. Full packaged frontend IPC capability enforcement remains open because the Windows Tauri MockRuntime probe exits with `STATUS_ENTRYPOINT_NOT_FOUND` before the test body.
- Perform authorized Windows desktop playback and updater acceptance in a disposable environment.
- Run Linux/NixOS package and WebKitGTK acceptance in the project development shell.

## Product work intentionally deferred

- Wallpaper Engine integration; see [[07-plans/future-wallpaper-engine-integration]].
- New cross-platform playback architecture.
- Bundled/configurable Windows player discovery, multi-monitor placement, and power-policy controls.

## Release hygiene

- Keep user work uncommitted unless explicitly authorized to commit.
- Do not push, tag, publish, install updates, or handle signing material without explicit authorization.
- Revalidate the release workflow/action version and draft-manifest readback against the installed project and official action documentation before the next release.
