---
title: Windows fixture runtime acceptance
updated: 2026-10-23
status: completed-with-limits
---

# Windows fixture runtime acceptance

## Scope

Exercise the reviewed no-bundle Tauri debug binary through its real frontend/native thumbnail flow using a temporary fixture directory. The fixture directory contained one valid 0.25-second MP4, one malformed MP4, and one empty MP4.

## Procedure and evidence

- Built a diagnostic binary with the alternate identifier `dev.matuz.wallpaper-picker-ui.fixture-probe`.
- Temporarily changed the external `WallpaperPickerUI/config.json` to point at the fixture directory with `newWallpapers: true`.
- Launched the diagnostic binary and waited for the normal frontend scan/generation path.
- The UI displayed exactly one wallpaper tile.
- The diagnostic app-owned `thumbnails/map.json` contained exactly one entry for `short.mp4`.
- The published PNG was 437 bytes, had a valid PNG signature, and its source file existed.
- Neither `malformed.mp4` nor `empty.mp4` appeared in the persisted map or thumbnail directory.
- Closed the diagnostic app and verified no diagnostic process or mpv process remained.

## Cleanup and limits

- Restored the external configuration to `G:\\Wallpapers` with `newWallpapers: false`.
- Removed the temporary fixture directory, diagnostic app-data directory, and scratch configuration.
- No user wallpaper file was modified, moved, renamed, or deleted.
- The Tauri `MockRuntime` frontend-IPC probe was not usable on this Windows host: constructing `tauri::test::mock_app()` terminated the test process with Windows `0xc0000139` (`STATUS_ENTRYPOINT_NOT_FOUND`) before the test body ran. Generated ACL resolution remains covered separately; full packaged frontend IPC enforcement is still unverified.
