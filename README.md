# Wallpaper Picker UI


A simple, lightweight UI for browsing, selecting, and applying wallpapers — especially optimized for animated/live wallpapers via `mpvpaper`.  
You can easily customize the command that gets executed when applying a wallpaper.

Wallpaper Picker Video

**Suggested default command (for mpvpaper):**
```bash
killall mpvpaper ; mpvpaper -o "loop no-audio" "*" "$VP"
```
There will be more script options at the wiki section

## Dependencies

- **FFmpeg** — required for generating thumbnails
- **mpvpaper** — recommended for animated/live wallpapers ([download here](https://github.com/GhostNaN/mpvpaper))
- **webkit2gtk-4.1** — needed for Tauri's webview on Linux
- **Zenity** — used for the "Choose folder" dialog

## Technologies
This application is built with **[Tauri](https://tauri.app/)** — a secure, lightweight framework for creating desktop apps.
- **Backend**: Rust — provides high performance, memory safety, and native system integration
- **Frontend**: Svelte + TypeScript — delivers a reactive, modern UI with strong type safety

## Features
- Clean grid-based wallpaper browser with thumbnail previews (generated via FFmpeg)
- Customizable apply command — works great with `mpvpaper`, but you can use any tool/script
- **Theme support** — comes pre-made theme and support to create your own, including manual toggle for **dark/light mode**
- **Multi-language support** — translations included for:
  - English
  - Português (Brasil)
  - Deutsch
  - Français
  - Español
- Simple folder selection via Zenity dialog
- Fast preview generation and responsive UI

## Installation

### From Releases

The easiest way — go to the [Releases](https://github.com/Rodrigo-Matuz/wallpaper-picker/releases) page and download the pre-built binary for your system.

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

   The binary will be in this directory. `.deb` and `.rpm` packages can be found in the `bundle/` directory.

Feel free to move the binary to your preferred location. Such as `/usr/bin/` for example

</details>

## Contributing Translations
The app supports multiple languages and makes it easy to add or improve translations.
1. Go to `/src/lib/lang`
2. Inside you'll find:
   - `translation.schema.json` (JSON Schema that validates every language file)
   - `/translations/` folder with existing language files (e.g. `english-translation.json`, `portuguese-brasil-translation.json`, etc.)
3. To add a new language or improve an existing one:
   - Copy an existing file (e.g. `english-translation.json`) and rename it to your language code (e.g. `italian-translation.json` for Italian)
   - Translate the values while keeping the **exact same keys**
   - Update the top-level fields:
     ```json
     {
       "code": "it",
       "name": "Italiano",
       "translations": { ... }
     }
     ```
     - `"code"`: use standard ISO 639-1 code (or ISO 639-2/3 when needed), optionally with region (e.g. `pt-br`, `zh-tw`)
     - `"name"`: human-readable name in English (this is how the language appears in the dropdown when choose a language)
4. The schema enforces the correct structure:
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
5. After adding/updating a file, rebuild the app to see your language in the dropdown. Or send your translation as a [PR](https://www.geeksforgeeks.org/git/how-to-create-a-pull-request-in-github/)
Thanks for helping make Wallpaper Picker available in more languages!

## TODO / Planned Features
- More pre-made themes included by default
- More responsive to different window sizes
- Built-in default scripts/templates for single-monitor and dual-monitor setups
- Option to select which monitor to apply the wallpaper to (multi-monitor support)
- Settings to increase thumbnail size and adjust the number of columns in the grid

**Contributions welcome — especially for new themes, monitor handling, and translations!**