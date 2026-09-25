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
* **UI / style rework (portfolio aesthetic)** — ported the matuz.dev design
  system into the app: Tailwind v4 `@theme` tokens (`#1e65ff` primary,
  `#702ef3` secondary, `#fc1a70` accent, `#030a14` bg, etc.), Inter +
  JetBrains Mono + Newsreader via Google Fonts, `text-gradient` and
  `animate-in` utilities, custom scrollbar (primary-on-hover), `::selection`
  secondary color, focus-visible outline. Re-spun button to square-edged
  uppercase with letter-spacing and 4 variants (accent / primary / outline /
  ghost). Re-skinned card, input, switch, dialog, select, and progress to
  flat `bg-surface` + `border-border` with no shadows. Navbar → translucent
  `bg-background/80 backdrop-blur-sm border-b`. Display grid → `bg-surface`
  thumbnail cards with a cleaner hover overlay. `Space` → gradient divider.
  Settings page → centered `max-w-2xl` single-column layout with consistent
  `p-6` card padding, `text-muted` descriptions, and `font-semibold text-lg`
  titles. Footer → `border-t border-foreground/10 bg-surface` with mono
  uppercase tracking.

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
* **Visual rework** — the entire app has been restyled to match the matuz.dev
  portfolio aesthetic.  The colour palette is now the portfolio's
  navy / blue-violet / pink scheme; buttons are square-edged uppercase with
  letter-spacing; cards, inputs, switches, dialogs, selects, and progress
  all use flat `bg-surface` + `border-border` with no shadows.  The navbar
  uses a translucent background with backdrop blur; the settings page is a
  centred single-column layout.  If you have custom CSS overrides, re-check
  them against the new token names (`--color-primary`, `--color-surface`,
  `--color-border`, etc.).
