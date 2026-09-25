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

        bun = pkgs.bun;
        rustPlatform = pkgs.rustPlatform;

        linux-deps = with pkgs; [
          webkit2gtk-4.1
          libappindicator3
          librsvg
          openssl
          pkg-config
          clang
          libclang
          icu69
          icu-data-en
        ];

        host-deps = if pkgs.stdenv.isLinux then linux-deps else [];

        # ── Dev shell (`nix develop`) ───────────────────────────────────────
        # Developers only.  End users who just want the app use `nix build`
        # or install via NixOS / Home Manager — they never enter this shell.
        # The shellHook is intentionally minimal: set up PATH + writable homes
        # + SSL certs, print a one-line hint.  No fancy banner.
        devShell = pkgs.mkShell {
          name = "wallpaper-picker-ui-dev";
          buildInputs = host-deps ++ [
            bun
            rustPlatform
            pkgs.pkg-config
            pkgs.openssl
            pkgs.openssl.dev
          ];

          OPENSSL_DIR         = "${pkgs.openssl.dev}";
          OPENSSL_LIB_DIR     = "${pkgs.openssl.outPath}/lib";
          OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";

          BUN_INSTALL = "$PWD/.bun";
          CARGO_HOME  = "$PWD/.cargo";
          RUSTUP_HOME = "$PWD/.rustup";

          SSL_CERT_DIR = "${(pkgs.certificate-transparency or pkgs.cacert or pkgs.curl).outPath}/etc/ssl/certs";

          shellHook = ''
            export PATH="$BUN_INSTALL/bin:$CARGO_HOME/bin:$PATH"
            echo "wallpaper-picker-ui dev shell — bun $(bun --version 2>/dev/null || echo ?) / rust $(rustc --version 2>/dev/null || echo ?)"
            echo "  bun run dev | build | tauri build | check | lint | test | version <ver>"
          '';
        };

        # ── Default package (`nix build`) ───────────────────────────────────
        app = pkgs.stdenvNoCC.mkDerivation {
          name = "wallpaper-picker-ui";
          src = ./.;
          vendorHash = null;

          buildInputs = host-deps ++ [
            bun
            rustPlatform
            pkgs.pkg-config
            pkgs.openssl
            pkgs.openssl.dev
          ];

          OPENSSL_DIR         = "${pkgs.openssl.dev}";
          OPENSSL_LIB_DIR     = "${pkgs.openssl.outPath}/lib";
          OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";

          BUN_INSTALL = "$TMPDIR/bun-home";
          CARGO_HOME  = "$TMPDIR/cargo";
          RUSTUP_HOME = "$TMPDIR/rustup";

          buildPhase = ''
            runHook preBuild
            export PATH="$BUN_INSTALL/bin:$CARGO_HOME/bin:$PATH"
            bun install --frozen-lockfile
            bun run build
            bun run tauri build --no-warn
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            if [ -d "src-tauri/target/release/bundle" ]; then
              cp -r src-tauri/target/release/bundle/* "$out/"
            fi
            if [ -f "src-tauri/target/release/wallpaper-picker-ui" ]; then
              mkdir -p "$out/bin"
              cp "src-tauri/target/release/wallpaper-picker-ui" "$out/bin/"
            fi
            if [ -f "src-tauri/target/release/wallpaper-picker-ui.exe" ]; then
              mkdir -p "$out/bin"
              cp "src-tauri/target/release/wallpaper-picker-ui.exe" "$out/bin/"
            fi
            runHook postInstall
          '';

          dontStrip = true;
        };

        # ── Home Manager module ─────────────────────────────────────────────
        # Lets the user declare their preferred app settings in HM config.
        # HM writes ~/.config/WallpaperPickerUI/config.json as the declarative
        # source of truth for these preferences.  The app reads this file on
        # startup and can update it via updateConfig() at runtime — but since
        # most fields are static (command, wallpapersPath, darkMode, language),
        # conflicts between HM and in-app changes are rare.
        #
        # thumbnailsHashMap is legacy (migrated to thumbnails/map.json) — HM
        # does not manage it.  thumbnailVersion is included so the app starts
        # with a known version; the app bumps it when the naming scheme changes.
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
                description = "Wallpaper command run by the app (e.g. /usr/bin/wallpaper \\$VP). Empty = no command configured.";
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
              # Write ~/.config/WallpaperPickerUI/config.json from the HM options.
              # home.file creates parent directories automatically.
              home.file.".config/WallpaperPickerUI/config.json" = {
                text = builtins.toJSON {
                  command = config.programs.wallpaper-picker-ui.command;
                  wallpapersPath =
                    config.programs.wallpaper-picker-ui.wallpapersPath
                    or "";
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
      in {
        packages = {
          default = app;
          app = app;
        };

        devShells = {
          default = devShell;
        };

        homeManagerModules = {
          default = homeManagerModules.default;
        };

        nixosModules.default = ({ config, pkgs, ... }:
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

        overlays = [
          (self: super: {
            wallpaper-picker-ui = self.packages.${system}.default or null;
          })
        ];
      }
    );
}
