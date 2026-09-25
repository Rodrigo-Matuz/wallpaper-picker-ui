# Release notes — Wallpaper Picker UI

**Status: work-in-progress.** This document tracks changes since the last
released version.  It will be finalised and published when the next release
tag is pushed.

---

# Release notes — Wallpaper Picker UI v3.4.0

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

# Changes since v3.4.0

**Status: work-in-progress — not yet released.**

The following commits have landed on `main` since `v3.4.0`.  They will ship
in the next release.

## ecd1b1b — Fix first-run i18n placeholder-key bug + serde_json (P0)

**Fixes a critical bug where the app displayed literal translation keys
(e.g. `home.search.placeholder`) instead of the translated text on first run.**

- Fixed English translation file language code from `"en"` to `"eng"` to match
  the codebase default (`index.ts` `currentLanguage`, `defaults.ts`, `t()`
  fallback).
- Fixed `import.meta.glob` module namespace handling in `index.ts`: Vite's eager
  JSON globs return `{ default: TranslationFile }` namespaces, so `mod.code` /
  `mod.name` / `mod.translations` were `undefined` at runtime, producing an
  empty `languages` registry and causing every `t(key)` to fall back to
  returning the key itself.
- Added `serde_json = "1"` to `Cargo.toml` `[dependencies]` (was missing; Rust
  code uses it for config serialization alongside `serde` with `derive`).

## 88ba669 — Replace all project icons with single source Icon.png

Generate every icon (Tauri bundle ICO/ICNS/PNGs, static web favicon and
`icon-256`) from one source image (`Icon.png` at repo root) using a new
`scripts/gen-icons.py` utility.  ICO and ICNS embed multiple resolutions; all
PNGs are Lanczos-resized to exact target dimensions.

Icon sizes produced (biggest first):

- `icon.png` — 512×512
- `128x128@2x.png` — 256×256
- `icon-256.png` — 256×256
- `Square310x310Logo.png` — 310×310
- `Square284x284Logo.png` — 284×284
- `128x128.png` — 128×128
- `Square150x150Logo.png` — 150×150
- `Square142x142Logo.png` — 142×142
- `Square107x107Logo.png` — 107×107
- `Square89x89Logo.png` — 89×89
- `Square71x71Logo.png` — 71×71
- `Square44x44Logo.png` — 44×44
- `StoreLogo.png` — 50×50
- `Square30x30Logo.png` — 30×30
- `32x32.png` — 32×32
- `favicon.png` — 100×100
- `icon.ico` — 16, 32, 48, 256 px embedded
- `icon.icns` — 16, 32, 64, 128, 256, 512, 1024 px embedded

## ad669cb — Add flake.nix for Nix support

- `nix develop` — dev shell with Bun + Rust + Tauri Linux system deps
  (webkit2gtk-4.1, openssl, libappindicator3, librsvg, clang, libclang,
  icu69, icu-data-en, pkg-config).
- `nix build` — Linux bundles (deb / rpm / appimage) under `./result`.
- Dev shell exports `BUN_INSTALL`, `CARGO_HOME`, `RUSTUP_HOME`, and
  `SSL_CERT_DIR` so bun, cargo, and HTTPS all work inside Nix.
- Includes NixOS module (`programs.wallpaper-picker-ui.enable`) and overlay
  for cross-flake consumption.

## 0931ad4 — Add Home Manager module and trim dev shellHook

- Added `homeManagerModules.default` with options for all user-facing config
  fields: `command`, `wallpapersPath`, `debugMode`, `newWallpapers`,
  `darkMode`, `language` (eng / pt-br / de / fr / es).  HM writes
  `~/.config/WallpaperPickerUI/config.json` as the declarative source of truth;
  the app reads it on startup and can update it via `updateConfig()` at runtime.
  `thumbnailsHashMap` is legacy (now in `thumbnails/map.json`) and is not managed
  by HM.
- Trimmed dev `shellHook` to a minimal one-liner (PATH + writable homes + SSL
  certs + a single hint line).  The shellHook only fires for developers who run
  `nix develop` — end users who install via `nix build` / NixOS / Home Manager
  never see it.

## 0da63d7 — Add Nix / Home Manager installation instructions to README

- Document dev shell (`nix develop`), NixOS module, Home Manager module, and
  manual `nix build`.
- Include a complete Home Manager example config with all available options.
- Add a note about `home-manager switch` behaviour vs in-app config edits.
- Add a short "Updating the version" subsection showing `bun run version`.

## d124493 — Improved README

- Move "Suggested Default Command" after Preview, before Dependencies.
- Clarify Dependencies: FFmpeg + mpvpaper (Linux) + WebView2 (Windows) + native
  folder dialog, no extra Windows deps; default command is Linux syntax.
- Add "Releases" section explaining the release workflow.
- Update "Build from Source" with `bun run tauri build --no-bundle`.
- Contributing Translations: add schema section, rename copy file to
  `<lang>-translation.json`, correct portuguese-brasil naming.
- Position "Contributing Translations" after "Installation".

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
