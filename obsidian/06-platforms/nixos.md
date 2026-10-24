---
title: NixOS and Home Manager
updated: 2026-10-22
---

# NixOS and Home Manager

`flake.nix` packages the published x86_64 Linux `.deb` and relinks it against Nixpkgs GTK/WebKitGTK dependencies. The development shell contains Bun, Rust, formatting/lint tools, GTK/WebKitGTK, GStreamer, and related native libraries.

The Home Manager module installs the package and seeds a user-owned config file after link generation. It avoids leaving the application config as a read-only Nix-store symlink.

The flake is release-pinned and should not be repinned or switched during this overhaul. Nix build/runtime acceptance, WebKit rendering, and updater interaction remain unverified here.