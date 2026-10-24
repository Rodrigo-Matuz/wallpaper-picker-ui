---
title: Overhaul scope
updated: 2026-10-22
status: completed-with-limits
---

# Overhaul scope

## Completed in the current working tree

- Preserve intentional custom commands while escaping selected `$VP` path data.
- Derive native thumbnail generation/recovery/cleanup paths from app data.
- Propagate video-scan and cleanup errors instead of treating partial failures as empty success.
- Serialize thumbnail generation/clear operations.
- Add force-regeneration plumbing and tests.
- Validate and atomically replace the thumbnail map.
- Add bounded FFmpeg availability/generation timeout and short-video seek fallback behavior.
- Narrow filesystem/process permissions and correct access-boundary documentation.
- Add agent/Obsidian documentation and a future Wallpaper Engine note explicitly marked not implemented.

## Still outside verified completion

- Real Linux/NixOS runtime and playback.
- Packaged Tauri capability enforcement.
- Real FFmpeg hung/malformed-media behavior.
- Full Windows desktop playback and installer acceptance.
- Hosted CI/release execution and updater install/reopen/data preservation.
- Real Graphify output refresh after the latest edits is complete; the artifact remains an ignored navigation aid, not runtime proof.

Do not convert these limits into claims of failure; they are unexecuted acceptance gates.