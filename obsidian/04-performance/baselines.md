---
title: Performance baselines
updated: 2026-10-22
---

# Performance baselines

No trustworthy product performance baseline was captured in this overhaul. Unit/component test timings, frontend build duration, and Rust test duration are verification data, not desktop startup, WebView paint, scan throughput, FFmpeg latency, or memory benchmarks.

The current implementation keeps thumbnail generation bounded by a four-worker frontend pool and a 30-second native FFmpeg process timeout. Those are design limits, not measured performance claims.

Future measurements should separate startup, first usable preview, recursive scan, thumbnail generation, IPC frequency/bytes, Blob publication, and memory/CPU. Report Windows/Linux/native GUI measurements separately from jsdom or headless results.