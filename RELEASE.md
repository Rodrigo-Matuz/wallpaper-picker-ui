# Release notes — Wallpaper Picker UI v3.6.0 (draft)

For the next release. Version numbers and the published v3.5.0 release remain unchanged until v3.6.0 is prepared and tagged.

## Changes

- Show **Wallpaper Picker UI** as the window title and application name in desktop and installer metadata. The executable remains `wallpaper-picker-ui`.
- Keep the existing application identifier and Windows MSI upgrade code so the display-name change does not create a separate MSI installation.

## For developers

- Added tests for frontend functions, Svelte components, scripts, and Rust backend modules. Each test lives alongside its implementation in a per-module directory.
- CI now runs Bun unit tests and Vitest component tests on Linux and Windows, alongside the existing Rust checks and tests.
