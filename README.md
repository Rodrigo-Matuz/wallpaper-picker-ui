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

* Grid-based wallpaper browser with clean thumbnail previews
* Automatic video thumbnails generated with FFmpeg
* Animated/live wallpaper support
* Customizable wallpaper apply command

  * Works with `mpvpaper`, but can use any script or tool
* Theme support

  * Includes a pre-made theme
  * Supports custom themes
  * Manual dark/light mode toggle
* Multi-language support:

  * English
  * Português (Brasil)
  * Deutsch
  * Français
  * Español

## Installation

### From Releases

The easiest option is to download a pre-built binary for your system from the [Releases](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases) page.

### NixOS / Home Manager

The project also provides a Nix flake with a buildable package and Home Manager module.

<details>
<summary>Show Nix installation</summary>

#### NixOS

Add the flake to your system configuration:

```nix
# configuration.nix (or your NixOS module overlay)
{
  inputs.wallpaper-picker-ui = {
    url = "github:Rodrigo-Matuz/wallpaper-picker-ui";
    inputs.nixpkgs.follows = "nixpkgs";
  };

  # ... then in your configuration ...
  programs.wallpaper-picker-ui.enable = true;
}
```

#### Home Manager

Add the flake to your Home Manager configuration:

```nix
# home.nix (or your HM modules)
{
  inputs.wallpaper-picker-ui = {
    url = "github:Rodrigo-Matuz/wallpaper-picker-ui";
    inputs.nixpkgs.follows = "nixpkgs";
  };

  home = {
    packages = with pkgs; [
      # (other packages...)
    ];

    programs.wallpaper-picker-ui = {
      enable = true;

      # The command the app runs when you apply a wallpaper.
      # $VP is replaced with the selected file path.
      command = "/usr/bin/mpvpaper -o \"loop no-audio\" \"*\" \"$VP\"";

      # Folder to scan for wallpapers (null = app prompts on first run).
      wallpapersPath = "/home/your-user/Pictures/wallpapers";

      # App behaviour preferences.
      debugMode = false;
      newWallpapers = true;
      darkMode = true;

      # UI language: "eng", "pt-br", "de", "fr", "es".
      language = "eng";
    };
  };
}
```

After `home-manager switch`, Home Manager writes:

```text
~/.config/WallpaperPickerUI/config.json
```

The app reads this file on startup. Settings can still be changed at runtime from the app's Settings screen, and those changes are written back to the same file through `updateConfig()`.

The `command`, `wallpapersPath`, `darkMode`, and `language` fields are static preferences, so conflicts between Home Manager and in-app edits are rare.

> **Note:** `home-manager switch` rewrites `config.json` to match your Home Manager declaration. If you frequently change settings in the app, run `home-manager switch` only after updating your declaration, or accept that Home Manager will reset the file to its declared state.

#### Nix development shell

For development, the flake provides a shell containing Bun, Rust, and the required Tauri Linux dependencies:

```bash
nix develop
```

The shell is intended for development. End users who only want to run the application do not need it.

#### Build the Nix package manually

```bash
nix build .#wallpaper-picker-ui

# result/ contains the Linux bundles (.deb, .rpm, .AppImage) and the binary
```

`nix build` runs the full Tauri build and produces Linux bundles under `./result`.

The signing key (`TAURI_SIGNING_PRIVATE_KEY`) must be available when building installer bundles. Use `nix build` inside a `nix develop` shell or pass the key through `--impure` / a wrapper.

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
* **Its own application data directory**

  * Create, read, write, list, and check files
  * Thumbnail cache:
    `~/.local/share/dev.matuz.wallpaper-picker-ui/thumbnails`
* **Application data directory creation** when it does not already exist
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

Releases are produced automatically by the GitHub Actions release workflow when a version tag such as `v3.4.0` is pushed to `main`.

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
git tag v3.4.0
git push origin v3.4.0
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
