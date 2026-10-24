---
title: Thumbnail pipeline
updated: 2026-10-22
---

# Thumbnail pipeline

The frontend owns orchestration and publication; Rust owns FFmpeg execution and app-data output.

1. The frontend reads or migrates the thumbnail map.
2. A successful scan obtains video paths from `get_videos_list`.
3. Missing or explicitly regenerated videos call `generate_thumb`.
4. Rust generation derives `app_data_dir()/thumbnails`, creates and validates that the directory is not a symlink/reparse point, checks FFmpeg availability through the bounded child-process runner, and runs FFmpeg.
5. The frontend persists the filename-to-video map, loads valid PNGs as Blob URLs, and publishes the store.
6. Orphan cleanup runs only after a successful scan and preserves `map.json`.

Generation and destructive clearing share a frontend operation lock. Application-work ownership remains active across directory setup, IPC, map writes, cleanup, Blob publication, and logging.

Rust generation has a 30-second FFmpeg process timeout, a seek fallback from one second to zero, and a one-second output-file wait. It writes to a unique temporary PNG and replaces the final preview only after a successful generation, so forced or timed-out failures retain the previous readable preview. Existing cache directories and entries are rejected when they are symlinks or Windows reparse points. Real hung/malformed-media timeout behavior is not exercised by the current unit suite.