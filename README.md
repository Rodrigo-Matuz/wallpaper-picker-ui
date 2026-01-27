# Wallpaper Picker UI

A simple UI for selecting and applying wallpapers with a customizable command. Designed to work with `mpvpaper`, but you can modify the command and options as needed.

**Suggested command:**

```bash
killall mpvpaper ; mpvpaper -o "loop no-audio" "*" $VP
```

[Wallpaper Picker Screenshot](https://github.com/user-attachments/assets/ec05beba-de5e-48d3-80e4-1258bb8183b1)

## Dependencies

- **FFmpeg:** Required for generating thumbnails
- **mpvpaper:** Download it from [here](https://github.com/GhostNaN/mpvpaper).
- **webkit2gtk-4.1**
- **Zenity:** To search for folder

## Installation

### From Releases

Visit the [Releases](https://github.com/Rodrigo-Matuz/wallpaper-picker/releases) page to download pre-built binaries.

### Build from Source

<details>
  <summary>Click to show instructions</summary>

1. **Clone the Project:**

    ```bash
    git clone https://github.com/Rodrigo-Matuz/wallpaper-picker
    ```

2. **Navigate to the Project Directory:**

    ```bash
    cd wallpaper-picker
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

Feel free to move the binary to your preferred location.

</details>
