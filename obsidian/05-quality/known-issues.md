---
title: Known issues and limits
updated: 2026-10-23
---

# Known issues and limits

- The working tree is intentionally dirty and uncommitted; no commit, push, release, or update installation was performed.
- Windows shell-escaping tests and a positive runtime slice run on the Windows host. mpv process startup and cleanup were observed, but full desktop background rendering, Explorer/display/sleep recovery, and the complete mpv lifecycle remain pending.
- Linux, NixOS, full packaged frontend IPC capability enforcement, a real 30-second hung FFmpeg decoder, installer acceptance, and updater install/reopen/data preservation are unverified. Windows acceptance now covers missing FFmpeg, empty media, malformed media, short-video fallback, and the real frontend/native fixture scan. A Tauri `MockRuntime` IPC probe could not run on this host because `tauri::test::mock_app()` terminated with `0xc0000139` (`STATUS_ENTRYPOINT_NOT_FOUND`) before the test body; generated ACL resolution has a passing Rust probe covering allowed commands, wrong-window scope, an unused command, and the removed opener command.
- The existing Graphify output is refreshed after the review-fix batch; future source changes require another refresh.
- Release workflow behavior is inspected from source; hosted GitHub Actions has not been run for this working tree.

These are verification limits, not claims that the corresponding code is broken.