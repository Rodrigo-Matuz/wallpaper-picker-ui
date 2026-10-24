---
title: Configuration
updated: 2026-10-22
---

# Configuration

Configuration is stored through the Tauri filesystem plugin under the configured application path. The default settings include the user-authored command, selected wallpaper directory, discovery toggle, theme/language preferences, and thumbnail version metadata.

Reads, repairs, updates, and deletes use the existing ordered persistence/application-work model. Settings actions treat a reported `false` or rejection as failure instead of claiming persistence success.

The wallpaper directory remains user-selected and may be outside app data. Native video discovery reads it recursively but does not use it as a thumbnail output or cleanup directory.

Home Manager/Nix activation seeds a normal user-owned config file rather than leaving the application pointed at a read-only store symlink. Nix package/update behavior is documented separately and is not an in-app updater authority.