# Wallpaper Picker UI agent instructions

## Bootstrap

1. Inspect `git status --short --branch`, `git rev-parse HEAD`, and the current diff. Preserve unrelated user changes.
2. Read `obsidian/HOME.md`, `obsidian/00-agent/current-state.md`, and `obsidian/00-agent/handoff.md`.
3. Load only the architecture/system notes relevant to the task.
4. Check Graphify with `graphify --version` and compare the graph's recorded revision with `git rev-parse HEAD`.
5. For structural changes, query the graph and verify every important result against source.

## Project rules

- Preserve the current UI, themes, translations, Linux command playback, Windows playback/fallback behavior, and user configuration unless a verified bug requires change.
- `$VP` is an intentional custom-command placeholder. Keep user-authored command support, but pass the selected path through the private child-process environment variable with context-aware shell quoting. Never interpret the selected path as a second command; Unix single-quoted `$VP` contexts must be rejected.
- Wallpaper directories are user-selected and may be outside the app data directory. Generated thumbnails, thumbnail recovery, and destructive thumbnail cleanup are app-owned operations and must stay scoped to the app data thumbnails directory, rejecting symlink/reparse-point redirection.
- Never delete, move, rename, or modify user wallpaper media from tests or maintenance code.
- Keep Windows-native code isolated from Linux command playback. Do not implement Wallpaper Engine support in this overhaul.
- Preserve signed-update and installer eligibility safeguards. Do not publish, tag, push, install updates, or alter signing material without explicit authorization.
- Run targeted tests after each behavior change, then the relevant frontend and Rust gates. Record verified results in the Obsidian handoff.

## Useful references

- Operational notes: `obsidian/HOME.md`
- Security notes: `obsidian/03-security/`
- Test matrix: `obsidian/05-quality/testing.md`
- Graphify workflow: `obsidian/08-reference/graphify.md`
