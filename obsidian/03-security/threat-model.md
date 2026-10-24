---
title: Security threat model
updated: 2026-10-22
---

# Security threat model

The main security boundary is a desktop application with trusted native code, a local frontend, user-selected media paths, and an intentional user-authored command feature.

## High-value assets

- User configuration and wallpaper locations.
- Generated thumbnail files and the thumbnail map.
- Updater trust/configuration.
- The current user's ability to execute commands.

## Important threats

- A selected media path changing custom-command shell syntax.
- Frontend IPC supplying a destructive thumbnail directory.
- An inaccessible wallpaper subtree being interpreted as an authoritative empty scan.
- Malformed or partially written thumbnail-map data causing unsafe reads or cleanup.
- Overbroad frontend capabilities exposing unrelated filesystem/process actions.
- Confusing frontend capability scope with native Rust or user-command authority.

## Boundaries in the current implementation

`$VP` path substitution is escaped for Unix shells and Windows `cmd.exe`, while the command syntax remains user-authored and unsandboxed. Thumbnail native commands derive app-owned output paths from `AppHandle`; the selected wallpaper directory is read-only discovery input. The capability file scopes frontend config/cache operations and grants restart only.

This model does not claim that custom commands or native code are sandboxed. They run with the current user's operating-system authority.