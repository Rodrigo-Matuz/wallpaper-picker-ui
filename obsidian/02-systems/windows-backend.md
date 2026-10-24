---
title: Windows playback backend
updated: 2026-10-22
---

# Windows playback backend

The Windows backend is isolated under `src-tauri/src/windows_playback/` and is compiled only on Windows. Non-Windows builds register the same command names with safe stubs.

The native player receives the selected video path as a separate process argument. It requests an immediate window, no terminal, no audio, infinite file looping, no border/OSC, and no input bindings.

The current backend is transitional and intentionally preserves existing behavior. Do not make Linux depend on it, and do not broaden it into a new cross-platform playback architecture without an explicit design and real Windows validation.

## Not verified here

This Windows host can compile and run Rust tests, but the overhaul has not performed a full desktop-shell placement or lifecycle acceptance test with a real mpv process.