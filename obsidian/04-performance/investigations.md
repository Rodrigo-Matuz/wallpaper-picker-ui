---
title: Performance investigations
updated: 2026-10-22
---

# Performance investigations

The main performance-sensitive paths are recursive video discovery, FFmpeg thumbnail generation, Blob URL publication, and updater/network startup work.

Current safeguards:

- Discovery and native thumbnail work run off the UI thread where implemented by Tauri async/blocking boundaries.
- Thumbnail generation is limited to four frontend workers.
- Repeated thumbnail calls join an active operation.
- FFmpeg is polled with a hard timeout and killed/waited on after expiry.
- Startup updater checks are designed to be nonblocking and silent, but real packaged-runtime timing is not measured here.

Do not infer WebView FPS, native IPC latency, or memory behavior from the passing test suites or a successful production build.