---
title: Application lifecycle
updated: 2026-10-22
---

# Application lifecycle

`applicationWork` is the shared frontend ownership boundary for asynchronous work. Work is counted before prerequisites and released in `finally` blocks after the operation's native calls, persistence, publication, cleanup, and diagnostics settle.

Thumbnail generation and clear operations serialize destructive/cache work with `withThumbnailOperation`. Repeated thumbnail requests join the active pipeline rather than running duplicate work.

The Tauri process capability is narrowed in the main capability to `process:allow-restart`; the frontend does not need the broader `process:default` permission for its restart path.

Startup updater checks and Windows playback cleanup remain native/runtime concerns. Unit and component tests do not prove real desktop lifecycle behavior.