---
title: Current repository state
updated: 2026-10-24
revision: current main after release verification
status: release-draft-verified-with-limits
---

# Current state

## Verified structure

- Frontend: SvelteKit/Svelte 5, TypeScript, Tailwind, Bun, Vite, Biome, Vitest/component tests.
- Native layer: Tauri 2 with Rust commands under `src-tauri/src/`.
- Wallpaper discovery reads a user-selected directory recursively through `get_videos_list`.
- Linux playback remains configurable command execution; Windows selects a native mpv backend with a configured-command fallback.
- Thumbnails are generated with FFmpeg, stored under app data, indexed by `map.json`, and exposed to the frontend through Blob URLs.
- Configuration mutations use an ordered queue and application-work ownership.
- Updater support is policy-driven and distinguishes managed installers, package-managed installs, AppImage/manual paths, and development builds.

## Graphify

A local `graphify` CLI is installed. A refreshed code-only graph was generated in ignored `graphify-out/` with 2,240 nodes, 3,970 extraction edges, 3,858 clustered graph edges, and 99 communities. See [[08-reference/graphify]].

## Completed implementation batch

The completed batch hardens native trust boundaries and cache/release reliability:

- `$VP` substitution uses a private environment variable with quote-context-aware shell references; Unix single-quoted contexts are rejected and custom commands remain user-authored.
- Native thumbnail generation, recovery, and cleanup derive their output directory from Tauri's app-data directory instead of accepting a caller-supplied destructive path.
- Native thumbnail operations reject symlink/reparse-point cache directories and entries; generation writes a temporary PNG and replaces the final file only after success.
- A Windows registry parity lint was fixed with `is_multiple_of(2)`.
- Thumbnail generation/clear operations are serialized, maps are validated and atomically replaced, unreadable published entries are removed from the persisted map, scan/cleanup errors propagate, and FFmpeg has bounded fallback behavior.
- Automatic thumbnail scans with no configured wallpapers path are skipped without cleanup; configuration persistence must succeed before orphan cleanup is authorized; legacy map migration rolls back `map.json` when config clearing is false or rejected.
- Vitest component execution uses forked workers with serial file scheduling because parallel runs reproduced Svelte/jsdom module contamination.
- Theme families now own colors only. Roundness, shadow strength, and spacing are persisted as independent global appearance settings and exposed in Settings, allowing a color theme to be combined with another visual style.
- Home Manager now exposes `themeRoundness`, `themeShadowStrength`, and `themeSpacing` and seeds them into the initial user-owned config file.
- Updater, dialog, and process capability entries are command-level permissions rather than broad plugin defaults; release matrix uploads are serialized to protect the shared draft manifest.
- CI now runs locked Rust format/check/test/clippy gates; release uses the Tauri Action v1 updater input contract.

The exact test results and remaining platform limits are recorded in [[00-agent/handoff]] and [[05-quality/known-issues]].

## Completion checkpoint

Completed on 2026-10-24 after the user resumed the task. The implementation was committed in `4039c12`, the draft-manifest verifier fix was committed in `e182016`, both were pushed to `main`, and tag `v3.9.0` was pushed at `e182016`. The tag-triggered release workflow completed successfully and left a verified draft release for manual review. Root `AGENTS.md`, `obsidian/HOME.md`, architecture/system/security/performance/quality/platform/plan/reference notes, and the future Wallpaper Engine note exist.

Current Git state: branch `main`; the release source revision is `cec7acfa439dcadaa2892094a4731cff9870a884`, and the pre-existing `.gitignore` modification is preserved as the only local uncommitted change. New/modified implementation files are listed in [[00-agent/handoff]].

Verified local gates: 454 Bun logic tests/45 files, 270 Vitest component tests/31 files, 85 Windows-host Rust tests, frontend translations/lint/check/build, Rust fmt/check/test/clippy, `bun run tauri build --debug --no-bundle --no-sign` for source version 3.9.0, release-contract tests, Home Manager/flake contract tests, Tauri permission listing, and `git diff --check` passed. Vitest uses forked workers with serial file execution to prevent cross-file `mode-watcher`/jsdom and `svelte-sonner`/Lucide module contamination. A Windows `cmd.exe` smoke test covered repeated spaces and metacharacters in `$VP` data; focused frontend regressions cover unset paths, unreadable previews, and failed config persistence. The generated Tauri ACL now has a Rust probe for allowed commands, wrong-window scope, an unused command, and the removed opener command. Four ignored native FFmpeg acceptance tests also pass for missing, malformed, empty, and short media fixtures. A real Windows frontend/native fixture scan published one valid short-video thumbnail and skipped malformed/empty media. The theme appearance decoupling batch adds focused tests for independent global geometry settings and Home Manager initialization.

Hosted verification: CI run `40080950815` passed for `e182016`; Release run `40080995074` passed with successful Linux and Windows builds and `verify_release`. Draft release `422629104` contains nine unique assets, no MSI, `latest.json` version `3.9.0`, matching release notes, and matching NSIS/AppImage signature sidecars. The draft remains unpublished pending manual review; payload cryptography, installer acceptance, and updater installation remain outside this verification.

## Live Windows acceptance

A diagnostic no-bundle debug binary built from the reviewed source was run against the user-provided `G:\Wallpapers` directory after reloading the external config. The app discovered 178 media files, generated 178 nonempty app-owned PNG thumbnails, wrote a 178-entry `thumbnails/map.json`, and every mapped source path existed under `G:\Wallpapers`. A second cache-only launch with discovery disabled loaded the saved previews. Selecting a tile spawned mpv and closing the app left no mpv process; desktop-shell background rendering was intentionally not evaluated in this batch.

## Known verification limits

Linux, NixOS, full packaged frontend IPC capability enforcement, a real 30-second hung FFmpeg decoder, installer acceptance, and packaged updater acceptance remain unverified. The Windows Tauri MockRuntime IPC probe exits with `STATUS_ENTRYPOINT_NOT_FOUND` before its test body, so only generated ACL resolution—not full frontend IPC enforcement—is currently verified. Windows mpv process startup/cleanup was observed, but full desktop background rendering, Explorer restart, monitor/display changes, and sleep/wake remain outside this batch.
