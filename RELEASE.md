# Release notes — Wallpaper Picker UI v3.4.0

**2026-09-25** — `v3.4.0`

## Highlights

* **Signed updater releases** — rotated the minisign key and enabled signed installers and `latest.json` through the release workflow.
* **Native folder picker** — replaced `zenity` / `rfd` with the Tauri native dialog plugin.
* **Faster thumbnails** — thumbnail generation now uses four concurrent FFmpeg workers.
* **More reliable video scanning** — async scanning skips hidden and known-noise directories.
* **Better error feedback** — command, thumbnail, and configuration failures now surface through UI toasts instead of failing silently.
* **Improved search** — shared normalization makes search behavior consistent across the app.
* **Thumbnail reliability** — collision-free filenames, automatic cleanup, regeneration handling, and stale thumbnail detection.
* **Config robustness** — corrupt configuration files are repaired automatically and config access is cached.
* **i18n consistency** — translation keys now use dot notation and are validated across all five languages.
* **Developer tooling** — added Biome, Bun types/tests, translation validation, and a versioning command.

## Upgrade notes

* Existing installations automatically migrate the thumbnail map from `config.json` to `thumbnails/map.json`.
* Thumbnails may be regenerated once after upgrading.
* The updater signing key was rotated. **v3.4.0 establishes the new signing baseline for future updates.**
* Windows users no longer need `zenity` or `rfd` for folder selection.
* **FFmpeg is still required on `PATH` for thumbnail generation.**

## CI & Releases

* CI runs frontend and Rust checks on pushes to `main` and pull requests.
* Releases are built automatically when a `v*` tag is pushed.
* Tagged releases produce signed installers and an updater feed.

For detailed implementation changes, see the commit history and project documentation.
