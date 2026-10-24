---
title: Testing strategy
updated: 2026-10-23
---

# Testing strategy

## Verified local gates

- `bun run check:translations`
- `bun run lint`
- `bun run check`
- `bun run test`
- `bun run test:components`
- `bun run build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all --check`
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`

The current Windows-host rerun recorded 451 Bun logic tests across 44 files, 268 Vitest component tests across 30 files, and 85 Rust unit tests with no failures. Vitest uses forked workers and serial file execution because parallel scheduling reproduced cross-file `mode-watcher`/jsdom and `svelte-sonner`/Lucide module contamination. Unix-only symlink/reparse regression tests are additionally compiled and exercised on Unix hosts.

## Boundary rules

Bun tests exclude `*.component.test.ts`; Vitest/jsdom owns DOM tests, loads `src/test/setup.ts` for localStorage behavior, and uses forked workers with `fileParallelism: false` for deterministic module/DOM isolation. Rust tests use module-local fixtures and do not modify user media. Tests mock Tauri IPC/plugin boundaries where native runtime access is unavailable.

## Native acceptance recorded

On the Windows host, a diagnostic no-bundle debug binary built from the reviewed source was run with `wallpapersPath` temporarily set to `G:\Wallpapers` and discovery enabled. It discovered 178 media files, generated 178 nonempty PNGs in the diagnostic app-owned thumbnail directory, wrote a 178-entry `map.json`, and passed source-path existence checks for every map entry. A relaunch with discovery disabled loaded the persisted previews. Selecting a tile spawned mpv and app exit removed the child process; desktop-shell background rendering was explicitly deferred.

The Rust capability probe now resolves the generated ACL and verifies that the main local webview can access the explicitly permitted filesystem removal, dialog open, and updater check commands, while a wrong-window request, an unused command, and the removed opener command are denied. This validates generated ACL resolution, not full packaged frontend IPC enforcement.

Ignored native acceptance tests were run explicitly with `cargo test --manifest-path src-tauri/Cargo.toml --locked generate_thumbnails::tests -- --ignored --test-threads=1 --nocapture`. All four passed: missing FFmpeg fails closed, empty and malformed media leave no published thumbnail, and a 0.25-second video succeeds through the `0`-timestamp fallback after the one-second seek produces no frame. The test run exposed and fixed a real fallback bug. The existing non-ignored bounded-runner test covers spawn failure and timeout kill/wait cleanup; a real 30-second hung FFmpeg shim remains untested.

The same cases were exercised through the real Windows debug app path with a temporary fixture directory. The frontend/native scan published exactly one valid 437-byte PNG for the short MP4 and persisted no entries for the malformed or empty files; the UI displayed exactly one tile. The external configuration and all temporary fixture/app-data files were restored or removed afterward. A Tauri `MockRuntime` frontend-IPC probe could not run on this host because `tauri::test::mock_app()` terminated with Windows `0xc0000139` (`STATUS_ENTRYPOINT_NOT_FOUND`) before the test body; generated ACL resolution remains separately covered.

Passing local tests and this positive runtime slice do not prove hosted CI, full packaged Tauri capability enforcement, Linux/NixOS runtime behavior, full Windows desktop rendering/lifecycle behavior, or updater installation/reopen acceptance.