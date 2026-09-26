{
  description = "wallpaper-picker-ui — Tauri 2 desktop app (Svelte 5 + Rust)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # ── Version tracking ───────────────────────────────────────────────
        # Updated automatically by .github/workflows/release.yml after each
        # tagged release (the workflow commits a new flake.nix to main).
        # Between releases the SHA256 below may lag the latest binary; if
        # `nix build` fails with a hash mismatch, either wait for the next
        # release or use `nix build .#latest` (impure, see below).
        #
        # To update manually: download the AppImage from the latest release,
        # run `sha256sum <file>`, and paste the hex into the string below.
        version = "3.4.0";

        appImageUrl =
          "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/wallpaper-picker-ui_${version}_amd64.AppImage";

        # ── Why we fetch a pre-built binary instead of building from source ─
        # wallpaper-picker-ui is a Tauri 2 app.  A full `tauri build` on Linux
        # requires the Rust toolchain, Node/Bun, Vite, AND the webkit2gtk-4.1
        # dev headers plus libxdo, libssl, libayatana-appindicator, librsvg, and
        # several other system libraries.  On GitHub Actions the build regularly
        # approaches or exceeds the 30-minute timeout, and the resulting Nix
        # derivation would have a very large closure that most end users don't
        # want to pull just to run the app.
        #
        # The released AppImage is self-contained — Tauri bundles a static webkit
        # build into it, so the binary runs on any Linux desktop without needing
        # webkit2gtk or any of the build-time dev libraries.  Fetching the ~83 MB
        # AppImage and wrapping it produces a small, fast `nix build` / `nix run`
        # with a verifiable, cached binary.
        #
        # If you need to build from source (e.g. for a patched version), use
        # `nix develop` to enter the dev shell (Bun + Rust + system deps) and run
        # `tauri build` inside it.  That path is intentionally not exposed as a
        # package in this flake for the reasons above.

        appImage = pkgs.fetchurl {
          url = appImageUrl;
          # "sha256-<64-hex-chars>" — compute with: sha256sum <downloaded file>
          sha256 = "sha256-8bf70e2a07ca35580d6cc8ba8da27bd2ada81469f14cb9d25e7667e8279bb018";
        };

        # ── Default package (`nix build` / `nix run`) ──────────────────────
        # Places the AppImage directly at $out/bin/wallpaper-picker-ui so that
        # ./result/bin/wallpaper-picker-ui is the executable itself.
        app = pkgs.stdenvNoCC.mkDerivation {
          name = "wallpaper-picker-ui-${version}";
          src = appImage;

          installPhase = ''
            mkdir -p "$out/bin"
            cp "$src" "$out/bin/wallpaper-picker-ui"
            chmod +x "$out/bin/wallpaper-picker-ui"
          '';
        };

        # ── Home Manager module ─────────────────────────────────────────────
        # Declaratively manages ~/.config/WallpaperPickerUI/config.json.
        # The app reads this file on startup and can update it at runtime via
        # updateConfig().  Most fields are static so HM/app conflicts are rare.
        homeManagerModules.default = { config, pkgs, lib, ... }:
          {
            options.programs.wallpaper-picker-ui = {
              enable = lib.mkOption {
                type = lib.types.bool;
                default = false;
                description = "Manage wallpaper-picker-ui user configuration via Home Manager.";
              };

              package = lib.mkOption {
                type = lib.types.package;
                default = self.packages.${pkgs.system}.default;
                description = "The wallpaper-picker-ui package to install.";
              };

              command = lib.mkOption {
                type = lib.types.str;
                default = "";
                description = "Wallpaper command run by the app (e.g. /usr/bin/wallpaper $VP). Empty = no command configured.";
              };

              wallpapersPath = lib.mkOption {
                type = lib.types.nullOr lib.types.str;
                default = null;
                description = "Folder to scan for wallpapers. Null = app prompts on first run.";
              };

              debugMode = lib.mkOption {
                type = lib.types.bool;
                default = false;
                description = "Enable debug logging.";
              };

              newWallpapers = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Automatically search for new wallpapers at startup.";
              };

              darkMode = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Start the app in dark mode.";
              };

              language = lib.mkOption {
                type = lib.types.enumeration [ "eng" "pt-br" "de" "fr" "es" ];
                default = "eng";
                description = "Application UI language.";
              };
            };

            config = lib.mkIf config.programs.wallpaper-picker-ui.enable {
              home.file.".config/WallpaperPickerUI/config.json" = {
                text = builtins.toJSON {
                  command = config.programs.wallpaper-picker-ui.command;
                  wallpapersPath =
                    config.programs.wallpaper-picker-ui.wallpapersPath or "";
                  debugMode = config.programs.wallpaper-picker-ui.debugMode;
                  newWallpapers = config.programs.wallpaper-picker-ui.newWallpapers;
                  darkMode = config.programs.wallpaper-picker-ui.darkMode;
                  language = config.programs.wallpaper-picker-ui.language;
                  thumbnailVersion = 1;
                };
              };

              home.packages = [ config.programs.wallpaper-picker-ui.package ];
            };
          };

        # ── NixOS module ────────────────────────────────────────────────────
        # System-wide install.  Does not manage config.json — use the app's
        # settings UI or a user-level HM declaration for that.
        nixosModules.default = ({ config, pkgs, lib, ... }:
          let
            wallpaper-picker-ui = self.packages.${pkgs.system}.default;
          in
          {
            options.programs.wallpaper-picker-ui = {
              enable = lib.mkOption {
                type = lib.types.bool;
                default = false;
                description = "Install wallpaper-picker-ui system-wide.";
              };
            };

            config = lib.mkIf config.programs.wallpaper-picker-ui.enable {
              environment.systemPackages = [ wallpaper-picker-ui ];
            };
          }
        );

        # ── Overlay ─────────────────────────────────────────────────────────
        overlays = [
          (self: super: {
            wallpaper-picker-ui = self.packages.${system}.default or null;
          })
        ];
      )
    // {
      # ── Impure "latest" package ───────────────────────────────────────────
      # Evaluates the GitHub releases API at fetch time to discover the current
      # tag, then downloads that release's AppImage.  Intentionally impure —
      # the result depends on when you evaluate the flake.  Use
      # `nix build .#latest` to always get the newest release without manually
      # updating `version` above.
      #
      # This is NOT reproducible across time.  For a pinned build use the
      # default `app` package.
      packages.latest = pkgs.stdenvNoCC.mkDerivation {
        name = "wallpaper-picker-ui-latest";
        src = pkgs.fetchurl {
          url = "https://api.github.com/repos/Rodrigo-Matuz/wallpaper-picker-ui/releases/latest";
          # The API response body is used as the fetchurl hash anchor; we parse
          # it below to extract the real download URL.
          sha256 = "sha256-2kW5WKre4P1stH5Z+zw0hQ3Kr5ZVwEhVIC9R2j01+9I=";
        };

        buildPhase = ''
          LATEST_TAG=$(node -e "
            const fs = require('fs');
            const api = JSON.parse(fs.readFileSync('$src', 'utf8'));
            console.log(api.tag_name);
          ")
          echo "Latest release tag: $LATEST_TAG"

          VERSION_NUM=${LATEST_TAG#v}
          APPIMAGE_URL="https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/${LATEST_TAG}/wallpaper-picker-ui_${VERSION_NUM}_amd64.AppImage"
          echo "Downloading: $APPIMAGE_URL"
          curl -fsSL "$APPIMAGE_URL" -o /tmp/wallpaper-picker-ui.AppImage
          chmod +x /tmp/wallpaper-picker-ui.AppImage
        '';

        installPhase = ''
          mkdir -p "$out/bin"
          cp /tmp/wallpaper-picker-ui.AppImage "$out/bin/wallpaper-picker-ui"
          chmod +x "$out/bin/wallpaper-picker-ui"
        '';

        buildInputs = [ pkgs.curl pkgs.nodejs ];
      };
    };
}
