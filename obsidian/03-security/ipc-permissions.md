---
title: IPC and Tauri permissions
updated: 2026-10-22
---

# IPC and Tauri permissions

The main capability is `src-tauri/capabilities/permissions.json` for the `main` window. It grants the frontend only the plugin commands and paths needed by the current UI.

Thumbnail map permissions are explicit:

- `exists`, text-read, and file-read cover `map.json`.
- PNG reads cover `$APPDATA/thumbnails/*`.
- write-file covers `map.json` and `map.json.tmp`.
- rename covers the map and its temporary file.
- remove covers only the app-owned thumbnails directory.
- process access is `process:allow-restart`, not `process:default`.

The generated capability schema is checked alongside the source capability. Permission tests assert the important path scopes and restart permission.

Capability scope is a frontend plugin boundary. It does not restrict native Rust filesystem access, Windows playback, or the intentionally unsandboxed configured command.