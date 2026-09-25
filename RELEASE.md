# Release notes — Wallpaper Picker UI v3.5

**In preparation — not yet released.** Finalise the highlights and upgrade notes
below before tagging `v3.5.0`.  The v3.4.0 notes further down are historical
reference.

## Highlights

* **Nix / Home Manager support** — the project ships a `flake.nix` with a dev
  shell, a buildable package (`nix build`), a NixOS module, and a Home Manager
  module that declaratively manages `~/.config/WallpaperPickerUI/config.json`.
* **Home Manager configuration module** — users can declare `command`,
  `wallpapersPath`, `debugMode`, `newWallpapers`, `darkMode`, and `language`
  in their HM config; HM writes `config.json` as the source of truth, and the
  app's runtime `updateConfig()` calls still work on top.
* **Single-source icon generation** — all Tauri bundle icons (ICO, ICNS, PNGs),
  the web favicon, and `icon-256` are now generated from one source image
  (`Icon.png`) via `scripts/gen-icons.py`.  ICO and ICNS embed multiple
  resolutions; every PNG is Lanczos-resized to its exact target dimensions.
* **Fix first-run i18n placeholder-key bug (P0)** — the app no longer displays
  literal translation keys (e.g. `home.search.placeholder`) on first run.  Two
  root causes fixed: English translation file code `"en"` → `"eng"` to match the
  codebase convention, and `import.meta.glob` module-namespace handling so the
  `languages` registry populated correctly at runtime.  `serde_json = "1"` added
  to `Cargo.toml` (was missing; Rust code uses it for config serialization).
* **README improvements** — added Nix / Home Manager installation instructions
  with a complete HM example config, documented `bun run version` for syncing
  the version across all three files, and clarified the Dependencies and
  Contributing Translations sections.

## Upgrade notes

* Nix / Home Manager users: `home-manager switch` rewrites
  `~/.config/WallpaperPickerUI/config.json` to match the HM declaration; the
  app's in-app setting edits are preserved if they happen after the switch, but
  a later switch will reset the file.  For most users `command`, `wallpapersPath`,
  `darkMode`, and `language` are static preferences, so conflicts are rare.
* All icons are now regenerated from `Icon.png`; if you replaced any icon file
  manually in a previous install, re-apply your changes to `Icon.png` and run
  `scripts/gen-icons.py`.
* The i18n fix means first-run users now see the correct translated text
  immediately; existing installs are unaffected.

---

**2026-09-25** — `v3.4.0`

## Highlights

* **Signed updater releases** — rotated the minisign key and enabled signed
  installers and `latest.json` through the release workflow.
* **Native folder picker** — replaced `zenity` / `rfd` with the Tauri native
  dialog plugin.
* **Faster thumbnails** — thumbnail generation now uses four concurrent FFmpeg
  workers.
* **More reliable video scanning** — async scanning skips hidden and known-noise
  directories.
* **Better error feedback** — command, thumbnail, and configuration failures
  now surface through UI toasts instead of failing silently.
* **Improved search** — shared normalization makes search behavior consistent
  across the app.
* **Thumbnail reliability** — collision-free filenames, automatic cleanup,
  regeneration handling, and stale thumbnail detection.
* **Config robustness** — corrupt configuration files are repaired automatically
  and config access is cached.
* **i18n consistency** — translation keys now use dot notation and are validated
  across all five languages.
* **Developer tooling** — added Biome, Bun types/tests, translation validation,
  and a versioning command.

## Upgrade notes

* Existing installations automatically migrate the thumbnail map from
  `config.json` to `thumbnails/map.json`.
* Thumbnails may be regenerated once after upgrading.
* The updater signing key was rotated. **v3.4.0 establishes the new signing
  baseline for future updates.**
* Windows users no longer need `zenity` or `rfd` for folder selection.
* **FFmpeg is still required on `PATH` for thumbnail generation.**

---

## Release process

Releases are produced automatically by the GitHub Actions release workflow
when a version tag (e.g. `v3.4.1`) is pushed to `main`. The workflow:

- Builds the app on Linux (Ubuntu) and Windows
- Produces signed installers: `.deb` / `.rpm` / `.AppImage` on Linux, NSIS
  `.exe` on Windows
- Signs the updater artifacts (`latest.json`) with the app's minisign key
- Opens a **draft release** for review and publishing

To trigger a new release:

```bash
git tag v3.4.1
git push origin v3.4.1
```

The signing key is configured in `src-tauri/tauri.conf.json` (public key) and
stored as the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
secrets in the repository (Settings → Secrets and variables → Actions).

> **Note:** Plain `bun run tauri build` fails at the signing step unless
> `TAURI_SIGNING_PRIVATE_KEY` is set. Use `--no-bundle` for a local binary
> without installers, or run the release workflow.

## CI & Releases

* CI runs frontend and Rust checks on pushes to `main` and pull requests.
* Releases are built automatically when a `v*` tag is pushed.
* Tagged releases produce signed installers and an updater feed.

For detailed implementation changes, see the commit history and project documentation.
