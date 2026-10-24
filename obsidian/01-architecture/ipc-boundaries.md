---
title: IPC boundaries
updated: 2026-10-22
---

# IPC boundaries

The frontend invokes Rust commands by name through `@tauri-apps/api/core`. The capability file grants the application window the minimal plugin permissions needed for dialog, filesystem, opener, process, updater, and window operations; Rust commands are registered separately in `src-tauri/src/lib.rs`.

## Trust categories

- **User-selected input:** wallpaper directories and video paths may live outside app data. Discovery and validation must not assume they are cache paths.
- **User-authored command text:** intentionally executable configuration. It is not itself a vulnerability, but substituted path data must not alter command syntax.
- **App-owned cache operations:** thumbnail generation, recovery, and cleanup. These commands derive their cache directory from `AppHandle.path().app_data_dir()`; the frontend no longer supplies a destructive output path.
- **Release metadata:** bounded and allowlisted by the update/release code; installation remains policy-gated.

When changing an IPC signature, update both the Tauri command and every frontend wrapper/test. Verify the generated command registration and invoke payload together.
