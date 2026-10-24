---
title: Thumbnail benchmarks
updated: 2026-10-22
---

# Thumbnail benchmarks

No real-media benchmark or hung-decoder benchmark has been run. The Rust suite verifies naming, hashing, valid-file reuse, forced regeneration policy, directory errors, and cleanup behavior with temporary fixtures.

The frontend suite verifies operation ownership, concurrent joining, map persistence, regeneration payloads, cache recovery, empty successful scans, and failure retention using mocks.

A meaningful future benchmark should use an isolated media fixture directory and record: scan count, generated count, FFmpeg wall time, failures, cache hit rate, map size, Blob publication time, and peak process memory. It must not modify user wallpaper files.