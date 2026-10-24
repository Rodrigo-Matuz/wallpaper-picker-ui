---
title: Thumbnail map migration and component-suite stability
updated: 2026-10-23
status: completed
---

# Thumbnail map migration and component-suite stability

## Thumbnail migration fix

The existing `migrateThumbnailMapFromConfig` path wrote `map.json` and then awaited `updateConfig({ thumbnailsHashMap: {} })` without checking its result. Because `updateConfig` returns `false` for reported configuration write failure, the old config field could remain while the new map existed; later launches would see `map.json` and skip migration permanently.

The migration now:

1. Writes the new map.
2. Requires `updateConfig` to resolve `true`.
3. Removes the newly written `map.json` when config clearing returns `false` or rejects, allowing a later launch to retry.
4. Logs rollback failure while preserving the original migration failure.

Regression coverage now includes reported false, rejected config clearing, rollback failure logging, and existing map-write failure behavior.

## Component test stability

The default component suite reproduced two failures only when files ran in parallel:

- `runtime.component.test.ts` timed out during the synthetic native-language bootstrap test.
- A concurrent `svelte-sonner` import failed with `TypeError: from_svg is not a function`.

The failing file passed alone, and the entire suite passed with `--fileParallelism=false`. The Vitest configuration now keeps the `forks` pool but sets `fileParallelism: false`, trading execution time for deterministic Svelte/jsdom and `svelte-sonner`/Lucide module isolation.

## Verification

- `bun run check:translations` passed: 5 translation files, 145 keys each.
- `bun run lint` passed.
- `bun run check` passed with zero diagnostics.
- `bun run test` passed: 451 tests across 44 files, 0 failures.
- `bun run test:components -- --reporter=dot` passed: 268 tests across 30 files, 0 failures.
- `bun run build` passed.
- `bun run tauri build --debug --no-bundle --no-sign` passed.
- `git diff --check` passed.
- Graphify was refreshed: 2,240 nodes, 3,970 extraction edges, 3,858 clustered edges, 99 communities.

No commit, reset, push, release, signing, updater installation, or user wallpaper modification was performed.
