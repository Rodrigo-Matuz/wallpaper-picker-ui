---
title: Linux platform
updated: 2026-10-22
---

# Linux platform

Linux playback remains the configured user-authored command path. The Windows native playback backend is not used on Linux.

The release bundle includes Debian, RPM, and AppImage targets. Package-managed/Nix installations are treated as external update paths by the updater policy; the application does not replace `/nix/store` or run a package manager.

The Linux native environment has not been exercised in this Windows session. In particular, mpvpaper, FFmpeg integration, WebKitGTK rendering, package installation, and updater notices require Linux/NixOS acceptance tests.