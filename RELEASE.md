# Release notes — Wallpaper Picker UI v3.6.1

This is a correction release for v3.6.0.

- Permit the app to check, read, and write its thumbnail map in the app-data directory. Thumbnail previews can be persisted and shown again.
- On Home Manager installations, seed `~/.config/WallpaperPickerUI/config.json` as a regular, writable file instead of a read-only Nix-store symlink. Existing user settings are left untouched on subsequent activations; Nix configuration values are initial defaults, not permanent overrides.

The Home Manager module change takes effect after updating its flake input and activating Home Manager/NixOS; installing the new binary alone does not replace an existing managed symlink. Nix package installations must also update the flake input after the release's `.deb` hash is committed to `main`.

In-app updating remains unavailable. Install v3.6.1 through your package manager or from the release assets; do not rely on an in-app update prompt.
