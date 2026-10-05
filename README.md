# Wallpaper Picker UI

[![License](https://img.shields.io/github/license/Rodrigo-Matuz/wallpaper-picker-ui)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Rodrigo-Matuz/wallpaper-picker-ui)](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases)
[![Downloads](https://img.shields.io/github/downloads/Rodrigo-Matuz/wallpaper-picker-ui/total)](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5f5f.svg)](https://ko-fi.com/matuz)

A simple, lightweight desktop UI for browsing, selecting, and applying wallpapers — with a strong focus on animated/live wallpapers using `mpvpaper`.

Wallpaper Picker UI lets you quickly preview wallpapers, automatically generate thumbnails, and customize the command used to apply a wallpaper.

## Preview

![Wallpaper Picker UI Preview](https://github.com/user-attachments/assets/7af456ba-116f-4141-b67b-48ebf16dc9c6)

## Features

- Grid-based wallpaper browser with clean thumbnail previews
- Automatic video thumbnails generated with FFmpeg
- Animated/live wallpaper support
- Customizable wallpaper apply command
- Works with `mpvpaper`, but can use any script or tool
- Theme support
  - Includes a pre-made theme
  - Supports custom themes
  - Manual dark/light mode toggle
- Multi-language support:
  - English
  - Português (Brasil)
  - Deutsch
  - Français
  - Español

## Installation

### From Releases

The easiest option is to download a pre-built binary for your system from the [Releases](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases) page.

### NixOS / Home Manager

The x86_64-linux flake installs the pinned GitHub release `.deb` binary, patched to use Nixpkgs' WebKitGTK and GTK libraries (with a desktop launcher and FFmpeg). The AppImage's bundled WebKitGTK can open a black window with an EGL error on newer Mesa/Wayland systems. The flake provides NixOS and Home Manager modules.

<details>
<summary>Show Nix installation</summary>

#### Flake input (NixOS or Home Manager)

Add the input to your root `flake.nix`:

```nix
wallpaper-picker-ui = {
  url = "github:Rodrigo-Matuz/wallpaper-picker-ui";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

Include `inputs.wallpaper-picker-ui.nixosModules.default` in
`nixosSystem.modules` and set `programs.wallpaper-picker-ui.enable = true;`
for a system-wide install. Or include
`inputs.wallpaper-picker-ui.homeManagerModules.default` in your Home Manager
module imports to install it per user and declare the preferences:

```nix
{ config, pkgs, ... }: {
  programs.wallpaper-picker-ui = {
    enable = true;
    command = "${pkgs.mpvpaper}/bin/mpvpaper -o \"loop no-audio\" \"*\" \"$VP\"";
    wallpapersPath = "${config.home.homeDirectory}/Wallpapers";
    debugMode = false;
    newWallpapers = true;
    darkMode = true;
    language = "eng"; # eng, pt-br, de, fr, es
  };
}
```

Home Manager uses these values **only to initialize**
`~/.config/WallpaperPickerUI/config.json`. It creates a regular, user-writable
file if one is missing; subsequent rebuilds leave it alone, so settings changed
in the app persist. When upgrading from the old Home Manager module, activation
removes the old managed symlink and seeds a writable file from the current Nix
values. Changing the Nix values later will **not** reset existing settings; use
the app to change them, or remove `config.json` while the app is closed and
activate Home Manager again to seed a fresh copy. Back up the file first if you
want to retain any settings. Do not also install the app directly with
`nix profile add` when Home Manager owns the package; duplicate profile entries
can prevent Home Manager activation.

#### Direct installation

```bash
nix build github:Rodrigo-Matuz/wallpaper-picker-ui
nix profile install github:Rodrigo-Matuz/wallpaper-picker-ui
```

The package fetches and verifies the pinned release `.deb`; it does not
compile Bun/Rust dependencies in the Nix sandbox. The release workflow updates
its version and hash when a new release is built. Check the native package with
`bash scripts/check-nix-package.sh` on a Nix host. No signing key is needed to
install the published release.

</details>

### Build from Source

<details>
<summary>Show build instructions</summary>

#### 1. Clone the project

```bash
git clone https://github.com/Rodrigo-Matuz/wallpaper-picker-ui
```

#### 2. Enter the project directory

```bash
cd wallpaper-picker-ui
```

#### 3. Install dependencies

The project uses Bun for package management:

```bash
bun install
```

#### 4. Build the project

```bash
bun run tauri build --no-bundle
```

This builds the application binary without generating installer bundles. Installer bundles require a code-signing key.

The release workflow (`.github/workflows/release.yml`) runs `tauri build` with the signing key configured as a GitHub Actions secret.

#### 5. Locate the binary

After building, the binary is located under:

```text
src-tauri/target/release
```

When the release workflow runs, Linux bundles (`.deb`, `.rpm`, and `.AppImage`) and the Windows NSIS `.exe` installer are produced under:

```text
src-tauri/target/release/bundle/
```

The binary can be moved to a directory in your `PATH`, such as `/usr/bin/` on Linux.

</details>

## Configuration

### Wallpaper command

Wallpaper Picker UI lets you define the command used to apply a selected wallpaper.

The suggested default is designed for Linux with `mpvpaper`:

```bash
killall mpvpaper ; mpvpaper -o "loop no-audio" "*" "$VP"
```

`$VP` is replaced with the selected wallpaper path.

On Windows, configure a Windows-appropriate command in Settings instead.

More script examples and advanced setups are available in the [wiki](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/wiki).

### Dependencies

#### Linux

* **FFmpeg** — required for generating video thumbnails
* **mpvpaper** — recommended for animated/live wallpapers
* **webkit2gtk-4.1** — required for Tauri's Linux webview

[GhostNaN/mpvpaper](https://github.com/GhostNaN/mpvpaper)

#### Windows

* **WebView2** — preinstalled on Windows 10/11
* **FFmpeg** — must be available on `PATH`
* Folder selection uses the native OS dialog, so no additional dependency is required

> **Windows note:** The suggested wallpaper command above uses Linux syntax. Configure your own command in Settings.

## Security & Permissions

Wallpaper Picker UI uses **Tauri 2's capability-based permission model** and requests only the privileges required by the application.

Permissions are explicitly scoped and can be inspected in:

```text
src-tauri/capabilities/permissions.json
```

### Custom scripts

> ⚠️ **Custom script warning**
>
> If you configure a custom wallpaper script, the application executes **exactly the command you define** and passes the selected wallpaper path as its **first argument** (`$VP`).
>
> The script runs with **your user permissions** and is not sandboxed by the application.
>
> Only use scripts you trust and understand. You are responsible for what your configured script does.

<details>
<summary>View detailed permissions</summary>

### What the app can access

* **Its own configuration file**

  * Linux: `~/.config/WallpaperPickerUI/config.json`
* **Its thumbnail cache**

  * Create/check the thumbnails directory, read/write `thumbnails/map.json`,
    and read generated thumbnail images via the Tauri filesystem plugin
  * Linux: `~/.local/share/dev.matuz.wallpaper-picker-ui/thumbnails`
  * The Rust backend generates and removes thumbnail images in that directory
* Tauri built-in functionality:

  * Open external links (`opener`)
  * Check for application updates (`updater`)
  * Restart itself during updates
  * Core window management and event handling

### What the app cannot access

* Files outside its own configuration and data directories
* Home folders such as Documents, Pictures, Downloads, or Desktop
* Mounted drives
* USB devices
* Network shares
* System-wide files
* Clipboard
* Camera
* Microphone
* Location
* Sensors
* Arbitrary system commands
* Data from other applications

In short, the application is limited to its own configuration and thumbnail cache.

</details>

## Contributing

### Translations

Wallpaper Picker UI supports multiple languages and makes it easy to add or improve translations.

<details>
<summary>Show translation instructions</summary>

#### 1. Open the translation directory

```text
src/lib/lang
```

Inside you'll find:

* `translation.schema.json` — JSON Schema used to validate translation files
* `translations/` — directory containing existing language files

Examples include:

```text
english-translation.json
portuguese-brasil-translation.json
```

#### 2. Add or update a translation

1. Copy an existing translation file.
2. Rename it to match your language, for example:
   `italian-translation.json`
3. Translate the values **without changing the keys**.
4. Update the top-level fields:

```json
{
  "code": "it",
  "name": "Italiano",
  "translations": {}
}
```

* `code` — ISO 639-1 code, or ISO 639-2/3 when needed; optionally include a region such as `pt-br` or `zh-tw`.
* `name` — human-readable language name in English, used in the language selector.

#### Schema

Translation files follow this schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Wallpaper Picker Translation File",
  "type": "object",
  "required": ["code", "name", "translations"],
  "properties": {
    "$schema": {
      "type": "string"
    },
    "code": {
      "type": "string",
      "minLength": 2
    },
    "name": {
      "type": "string"
    },
    "translations": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": {
        "type": "string"
      }
    }
  },
  "additionalProperties": false
}
```

After adding or updating a translation, rebuild the application to see it in the language dropdown, or submit it as a [pull request](https://github.blog/developer-skills/github/beginners-guide-to-github-creating-a-pull-request/).

Thanks for helping make Wallpaper Picker available in more languages!

</details>

## Development

<details>
<summary>Show development details</summary>

### Technologies

Wallpaper Picker UI is built with **[Tauri](https://tauri.app/)**, a secure and lightweight framework for desktop applications.

* **Backend:** Rust

  * High performance, memory safety, and native system integration
* **Frontend:** Svelte + TypeScript

  * Reactive UI with strong type safety and a modern development experience

### Testing

```bash
bun install --frozen-lockfile
bun run check:translations
bun run lint
bun run check
bun run test             # Bun tests for application logic and scripts
bun run test:components  # Vitest/jsdom tests for Svelte components
bun run build

# With Rust and Tauri's system dependencies installed:
cd src-tauri && cargo check && cargo test
```

Tests live beside their implementations in per-module directories (for example,
`src/lib/api/config/read/read.ts` and `read.test.ts`, or
`src-tauri/src/get_videos_list/mod.rs` and `tests.rs`). The CI workflow runs both
frontend test commands on Linux and Windows, plus the Rust suite on both platforms.

### Updating the version

The project keeps its version synchronized across three files with a script:

```bash
bun run version 3.4.1
```

This updates:

* `package.json`
* `src-tauri/tauri.conf.json`
* `src-tauri/Cargo.toml`

Commit the changes and push them. The release workflow triggers automatically when a `v*` tag is pushed.

### Releases

Releases are produced automatically by the GitHub Actions release workflow when a version tag such as `v3.5.0` is pushed from `main`.

The workflow:

* Builds the application on Linux (Ubuntu) and Windows
* Produces signed installers:

  * `.deb`
  * `.rpm`
  * `.AppImage`
  * NSIS `.exe`
* Signs updater artifacts (`latest.json`) with the application's minisign key
* Opens a **draft release** for review and publishing

To trigger a release:

```bash
git tag v3.5.0
git push origin v3.5.0
```

The public signing key is configured in `src-tauri/tauri.conf.json`.

The private signing key and password are stored as:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

These are configured as GitHub Actions secrets under:

```text
Settings → Secrets and variables → Actions
```

> **Note:** Plain `bun run tauri build` fails at the signing step unless `TAURI_SIGNING_PRIVATE_KEY` is set.
>
> Use `--no-bundle` for a local binary without installers, or use the release workflow.

</details>

## Roadmap

Planned features include:

* More pre-made themes included by default
* Better responsiveness across different window sizes
* Built-in script/templates for single-monitor and dual-monitor setups
* Selecting which monitor receives the wallpaper
* Thumbnail size and grid-column controls

**Contributions are welcome**, especially for new themes, monitor handling, and translations!

## Support

If you enjoy **Wallpaper Picker UI** and want to support its development, you can donate via Ko-fi.

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/matuz)

Any amount is appreciated. Thank you for supporting the project!
