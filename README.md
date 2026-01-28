# Wallpaper Picker UI

[![License](https://img.shields.io/github/license/Rodrigo-Matuz/wallpaper-picker-ui)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Rodrigo-Matuz/wallpaper-picker-ui)](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases)
[![Downloads](https://img.shields.io/github/downloads/Rodrigo-Matuz/wallpaper-picker-ui/total)](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5f5f.svg)](https://ko-fi.com/matuz)


A simple, lightweight desktop UI for browsing, selecting, and applying wallpapers — with a strong focus on animated/live wallpapers using `mpvpaper`.

The app lets you quickly preview wallpapers, generate thumbnails automatically, and customize the command executed when applying a wallpaper, making it flexible for different setups and scripts.

## Preview

![Wallpaper Picker UI Preview](https://github.com/user-attachments/assets/7af456ba-116f-4141-b67b-48ebf16dc9c6)

## Suggested Default Command (mpvpaper)
```bash
killall mpvpaper ; mpvpaper -o "loop no-audio" "*" "$VP"
```
More script examples and advanced setups are available in the [wiki](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/wiki).

## Dependencies
- **FFmpeg** — required for generating video thumbnails
- **mpvpaper** — recommended for animated/live wallpapers
  ([GhostNaN/mpvpaper](https://github.com/GhostNaN/mpvpaper))
- **webkit2gtk-4.1** — required for Tauri’s webview on Linux
- **Zenity** — used for the folder selection dialog

## Technologies
This application is built with **[Tauri](https://tauri.app/)** — a secure and lightweight framework for desktop applications.
- **Backend**: Rust
  High performance, memory safety, and native system integration
- **Frontend**: Svelte + TypeScript
  Reactive UI with strong type safety and a modern developer experience

## Features
- Grid-based wallpaper browser with clean thumbnail previews (generated via FFmpeg)
- Supports animated/live wallpapers
- Customizable apply command (works with `mpvpaper`, but any script or tool can be used)
- **Theme support**
  - Comes with a pre-made theme
  - Supports custom themes
  - Manual **dark / light mode** toggle
- **Multi-language support**, including:
  - English
  - Português (Brasil)
  - Deutsch
  - Français
  - Español

## Installation

### From Releases

The easiest option:
Go to the [Releases](https://github.com/Rodrigo-Matuz/wallpaper-picker/releases) page and download the pre-built binary for your system.

### Build from Source

<details>
  <summary>Click to show instructions</summary>

1. **Clone the Project:**

    ```bash
    git clone https://github.com/Rodrigo-Matuz/wallpaper-picker-ui
    ```

2. **Navigate to the Project Directory:**

    ```bash
    cd wallpaper-picker-ui
    ```

3. **Install Dependencies:**
   The project uses Bun for package management. Install dependencies with:

    ```bash
    bun install
    ```

4. **Build the Project:**

    ```bash
    bun run tauri build
    ```

5. **Locate the Binary:**
   After building, find the binary in the release directory:

    ```bash
    cd src-tauri/target/release
    ```

   The binary will be in this directory. `.deb` and `.rpm` packages can be found in the `bundle/` directory. You can move the binary to a directory in your `PATH`, such as `/usr/bin/`.


</details>

## Contributing Translations
<details>
  <summary>Click to show instructions</summary>

Wallpaper Picker supports multiple languages and makes it easy to add or improve translations.

### How to contribute

1. Go to `/src/lib/lang`
2. Inside you’ll find:
   * `translation.schema.json` — JSON Schema used to validate translation files
   * `translations/` — folder containing existing language files
     (e.g. `english-translation.json`, `portuguese-brasil-translation.json`)
3. To add a new language or improve an existing one:
   * Copy an existing file
   * Rename it to your language (e.g. `italian-translation.json`)
   * Translate the values **without changing the keys**
4. Update the top-level fields:
```json
{
  "code": "it",
  "name": "Italiano",
  "translations": { }
}
```
* `code`: ISO 639-1 code (or 639-2/3 if needed), optionally with region
  Examples: `pt-br`, `zh-tw`
* `name`: Human-readable name in English (used in the language selector)

### Schema Overview

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Wallpaper Picker Translation File",
  "type": "object",
  "required": ["code", "name", "translations"],
  "properties": {
    "$schema": { "type": "string" },
    "code": { "type": "string", "minLength": 2 },
    "name": { "type": "string" },
    "translations": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

After adding or updating a translation, rebuild the app to see it in the language dropdown, or submit it as a [pull request](https://github.blog/developer-skills/github/beginners-guide-to-github-creating-a-pull-request/).
Thanks for helping make Wallpaper Picker available in more languages.

</details>

## TODO / Planned Features
- More pre-made themes included by default
- More responsive to different window sizes
- Built-in default scripts/templates for single-monitor and dual-monitor setups
- Option to select which monitor to apply the wallpaper to (multi-monitor support)
- Settings to increase thumbnail size and adjust the number of columns in the grid

**Contributions welcome — especially for new themes, monitor handling, and translations!**

## Support the Project

If you like **Wallpaper Picker UI** and want to support its development, you can make a donation.

Donations help motivate continued development, bug fixes, and new features.

### Support the Project

If you enjoy **Wallpaper Picker UI** and want to support its development, you can donate via Ko-fi.

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/matuz)

Any amount is appreciated. Thank you for your support!

