---
title: Thumbnail cache
updated: 2026-10-23
---

# Thumbnail cache

The cache is app-owned and lives under the Tauri AppData `thumbnails` directory. The persisted index is `thumbnails/map.json`; generated image files are PNGs in the same directory.

The map is validated before use and before persistence. Keys must be filename-like nonempty `.png` names without path separators, and values must be nonempty strings. Invalid JSON or shapes are logged and treated as an empty readable map.

Writes use `map.json.tmp` followed by a scoped rename to reduce partial-file exposure. Rename failure attempts to remove the temporary file and rethrows the original error.

Legacy `thumbnailsHashMap` migration writes the new map first, then clears the config field only after `updateConfig` confirms persistence. A false or rejected config update rolls back the newly written map so a later launch can retry; rollback failures are logged.

Cache-only visits do not prune entries from a failed or unavailable wallpaper scan. A successful empty scan is authoritative and may remove orphaned PNGs while retaining `map.json`. Published Blob URLs are revoked when the cache is destructively cleared or replaced.