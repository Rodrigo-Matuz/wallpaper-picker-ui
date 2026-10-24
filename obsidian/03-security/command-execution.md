---
title: Custom command execution
updated: 2026-10-22
---

# Custom command execution

The custom command feature is intentional and remains supported. The frontend sends the configured command and selected video path to the native `send_command` command.

The native boundary never inserts the selected path into command text. It passes the path through a private child-process environment variable and replaces every literal `$VP` with a context-aware reference:

- Unix uses `"${WALLPAPER_PICKER_UI_VIDEO_PATH}"` for a bare placeholder and `${WALLPAPER_PICKER_UI_VIDEO_PATH}` when the placeholder is already inside double quotes. A placeholder inside single-quoted shell text is rejected because external data cannot be safely inserted into that shell context.
- Windows uses `"%WALLPAPER_PICKER_UI_VIDEO_PATH%"` for a bare placeholder and `%WALLPAPER_PICKER_UI_VIDEO_PATH%` inside double quotes. The raw `/C` command preserves the intended `cmd.exe` parsing while keeping path metacharacters out of the command source.

The command itself is still user-authored shell syntax. Linux uses `sh`; Windows uses `cmd.exe`; the spawned command runs with the current user's permissions and is not sandboxed. A successful shell spawn does not prove that the wallpaper tool succeeded.

Tests cover repeated placeholders, empty paths, partial placeholders, quote-context handling, Unix single-quote rejection, Windows metacharacters, and a Windows `cmd.exe` argument smoke test with repeated spaces and metacharacters. Documentation examples leave `$VP` unquoted because the backend supplies the required quoting.

Do not replace this feature with a native command allowlist without an explicit product decision; the current security fix protects path substitution while preserving user intent.