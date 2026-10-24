---
title: Working rules
updated: 2026-10-22
---

# Working rules

1. Preserve user changes and inspect the diff before every broad edit.
2. Prefer small, independently testable batches over rewrites.
3. Keep user-selected wallpaper paths unrestricted for discovery, but scope app-owned cache writes/deletes to the app-data thumbnails directory.
4. Treat custom command text as trusted configuration and selected media paths as data that must be escaped before shell execution.
5. Keep platform branches explicit: Linux command playback is not replaced by Windows-native behavior.
6. Do not add UI strings without updating all supported translations and running `bun run check:translations`.
7. Do not weaken updater signature, provenance, downgrade, eligibility, or consent checks.
8. Do not run destructive tests against real wallpaper folders or user configuration.
9. Record test commands and distinguish verified behavior from platform work that remains unverified.
