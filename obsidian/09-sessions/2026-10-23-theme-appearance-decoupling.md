---
title: Theme appearance decoupling
updated: 2026-10-23
status: verified-local
---

# Theme appearance decoupling

## Goal

Allow users to keep a theme family's color palette while independently choosing visual geometry. Theme families must not overwrite roundness, shadow strength, or spacing.

## Implementation

- Removed `geometry` from `ThemeVariant`; theme families now own color tokens only.
- Added persisted optional fields `themeRoundness`, `themeShadowStrength`, and `themeSpacing`.
- Added `src/lib/theme/appearance.ts` for defaults, validation, CSS variables, store state, and compatibility resolution.
- Added `src/lib/theme/setThemeAppearance.ts` for independent persistence and publication.
- Kept legacy per-theme geometry as a migration fallback for configurations that lack the new fields.
- Updated color-theme switching to preserve the resolved global appearance.
- Added Settings controls for Roundness, Shadow strength, and Spacing.
- Added Home Manager options and initial-config seeding for all three appearance settings.
- Updated all five translation files and release/theme documentation.
- Prepared source version `3.9.0` and synchronized `RELEASE.md` with the draft release workflow body.

## Verification

- `bun run lint`: passed; 238 files checked.
- `bun run check`: passed with zero Svelte errors/warnings.
- `bun run test`: passed, 454 tests across 45 files.
- `bun run test:components -- --reporter=dot`: passed, 270 tests across 31 files.
- `bun run check:translations`: passed; 5 files with 164 keys each.
- `bun run build`: passed; production SvelteKit build completed.
- `bun run tauri build --debug --no-bundle --no-sign`: passed for source version `3.9.0`.
- `git diff --check`: passed.

Rust/native playback and thumbnail behavior were not changed by this batch. Existing platform and packaging limits remain documented in `obsidian/00-agent/handoff.md`.
