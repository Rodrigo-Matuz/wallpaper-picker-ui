# Release notes

## New

- Added selectable theme families with dark and light variants, including Arctic and Orchid.
- Added independent global controls for roundness, shadow strength, and spacing, so color themes can be mixed with different visual styles.
- Added Home Manager options for initializing the independent theme appearance settings.
- Hardened thumbnail generation and cache recovery with app-owned paths, validated outputs, atomic map updates, and failure-safe replacement.

## Fixed

- DeepOcean preview icons now remain blue instead of inheriting the purple accent.
- Destructive actions remain visually dangerous across every theme.
- Selected wallpaper cards now preserve the configured global radius.
- Custom `$VP` paths are passed as data instead of being inserted into command syntax.
- The Windows playback notice is shown in Settings rather than on Home.
- Fixed broken WebKitGTK layout metrics when running the app through the Nix development shell.
