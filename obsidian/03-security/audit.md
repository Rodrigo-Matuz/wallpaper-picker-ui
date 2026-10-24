---
title: Security audit status
updated: 2026-10-22
---

# Security audit status

## Addressed and verified locally

- `$VP` selected-path shell injection: platform-aware escaping plus Rust regression tests.
- Caller-controlled thumbnail output/cleanup paths: native commands derive app-data thumbnails from `AppHandle`.
- Missing thumbnail remove permission and swallowed clear failures: scoped remove permission, boolean result, UI failure reporting.
- WalkDir error suppression: scans now return descriptive errors instead of partial authoritative results.
- Force regeneration plumbing: frontend IPC and Rust generation both receive the flag.
- Thumbnail clear/generation overlap: frontend operation lock.
- Thumbnail-map shape and traversal validation: invalid maps fail closed to an empty readable map; writes reject invalid records.
- Non-atomic map writes: temporary file plus scoped rename.
- FFmpeg indefinite wait risk: bounded process polling/kill and a seek fallback.
- README capability claims: access boundaries now distinguish frontend permissions from native/user-command authority.

## Residual limits

No real malicious custom command should be executed as part of tests. Windows shell behavior has unit coverage on the Windows host, but no end-to-end wallpaper command was launched. FFmpeg timeout behavior with a genuinely hung decoder, native Tauri capability enforcement in a packaged binary, Linux/NixOS runtime behavior, updater installation, and desktop playback remain unverified here.

No credentials, signing keys, tokens, passwords, or private connection strings belong in this vault or repository changes.