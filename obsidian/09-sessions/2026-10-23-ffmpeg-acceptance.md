---
title: FFmpeg failure-fixture acceptance
updated: 2026-10-23
status: completed-with-limits
---

# FFmpeg failure-fixture acceptance

## Scope

Exercise native thumbnail generation with real FFmpeg media and failure fixtures without touching the user's wallpaper library. The tests use temporary directories and are marked `#[ignore]` because ordinary CI should not require a system FFmpeg installation.

## Command

```text
cargo test --manifest-path src-tauri/Cargo.toml --locked generate_thumbnails::tests -- --ignored --test-threads=1 --nocapture
```

## Results

All four acceptance tests passed on the Windows host:

- Missing FFmpeg executable: fails closed with the actionable `ffmpeg was not found on PATH` error; the app-owned thumbnail directory may already exist, but it remains empty.
- Empty MP4: FFmpeg rejects it; no final thumbnail or temporary `.tmp.png` file is published.
- Malformed MP4: FFmpeg rejects it; no final thumbnail or temporary `.tmp.png` file is published.
- 0.25-second valid MP4: the one-second seek produces no visible frame, then the `0` seek fallback succeeds and publishes a valid nonempty PNG.

The short-video test initially exposed a real bug: FFmpeg returned success for the one-second seek while producing no output frame, and the implementation returned failure instead of trying the fallback. `generate_thumbnail` now continues to the next seek whenever a successful FFmpeg process does not produce a readable thumbnail.

The existing non-ignored bounded-runner test also passes for spawn failure and timeout kill/wait cleanup. A full end-to-end hung-FFmpeg shim was not run because the production timeout is 30 seconds; the runner-level timeout path is the deterministic coverage for that boundary.

## Verification limits

This acceptance does not cover Linux/NixOS FFmpeg behavior, packaged frontend IPC, or a real 30-second hung decoder. No user wallpaper files or persistent configuration were modified.
