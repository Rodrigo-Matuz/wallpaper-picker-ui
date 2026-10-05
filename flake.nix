{
  description = "Wallpaper Picker UI — NixOS and Home Manager installation";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux"; # The upstream release only publishes amd64 Linux bundles.
      pkgs = nixpkgs.legacyPackages.${system};
      lib = nixpkgs.lib;
      version = "3.6.0";
      # Use the published .deb binary, not a sandboxed source build (Bun and
      # Cargo need prefetched dependencies). The AppImage bundles Ubuntu's
      # WebKitGTK/Wayland libraries and displays a black window with EGL errors
      # on newer NixOS Mesa. Re-link this binary to Nixpkgs' native WebKitGTK.
      # Hash verified against the downloaded release asset's GitHub SHA-256.
      deb = pkgs.fetchurl {
        url = "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/Wallpaper.Picker.UI_${version}_amd64.deb";
        hash = "sha256-P01D7lIg1eD+myPvfUzzGFKirUTSXUictIALsTyfMiM=";
      };
      package = pkgs.stdenv.mkDerivation {
        pname = "wallpaper-picker-ui";
        inherit version;
        src = deb;
        nativeBuildInputs = with pkgs; [ dpkg autoPatchelfHook wrapGAppsHook3 ];
        buildInputs = with pkgs; [
          gtk3 webkitgtk_4_1 libsoup_3 gdk-pixbuf cairo glib glib-networking
          librsvg libayatana-appindicator
        ];
        unpackPhase = ''
          runHook preUnpack
          dpkg-deb -x "$src" .
          runHook postUnpack
        '';
        dontConfigure = true;
        dontBuild = true;
        dontStrip = true;
        installPhase = ''
          runHook preInstall
          install -Dm755 usr/bin/wallpaper-picker-ui "$out/bin/wallpaper-picker-ui"
          mkdir -p "$out/share"
          cp -r usr/share/. "$out/share/"
          runHook postInstall
        '';
        preFixup = ''
          # Video thumbnails launch ffmpeg by name; GTK needs schemas/modules.
          gappsWrapperArgs+=(--prefix PATH : ${lib.makeBinPath [ pkgs.ffmpeg ]})
        '';
        meta = {
          description = "Desktop UI for browsing and applying wallpapers";
          homepage = "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui";
          license = lib.licenses.mit;
          mainProgram = "wallpaper-picker-ui";
          platforms = [ system ];
        };
      };
    in
    {
      packages.${system}.default = package;

      homeManagerModules.default = { config, pkgs, lib, ... }:
        let
          cfg = config.programs.wallpaper-picker-ui;
          configPath = "${config.xdg.configHome}/WallpaperPickerUI/config.json";
          initialConfig = pkgs.writeText "wallpaper-picker-ui-initial-config.json" (builtins.toJSON {
            inherit (cfg) command debugMode newWallpapers darkMode language;
            wallpapersPath = if cfg.wallpapersPath == null then "" else cfg.wallpapersPath;
            thumbnailVersion = 1;
          });
        in
        {
          options.programs.wallpaper-picker-ui = {
            enable = lib.mkEnableOption "Wallpaper Picker UI";
            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
              description = "Wallpaper Picker UI package to install.";
            };
            command = lib.mkOption {
              type = lib.types.str;
              default = "";
              description = "Command used to apply the wallpaper ($VP is the selected path).";
            };
            wallpapersPath = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "Directory to scan for wallpapers.";
            };
            debugMode = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Enable debug logging.";
            };
            newWallpapers = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Scan for new wallpapers at startup.";
            };
            darkMode = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Start in dark mode.";
            };
            language = lib.mkOption {
              type = lib.types.enum [ "eng" "pt-br" "de" "fr" "es" ];
              default = "eng";
              description = "Application UI language.";
            };
          };

          config = lib.mkIf cfg.enable {
            home.packages = [ cfg.package ];
            # A managed xdg.configFile is a read-only store symlink. Let Home
            # Manager remove its old link during linkGeneration, then seed a
            # normal user-owned file only when no config already exists.
            home.activation.wallpaperPickerSeed = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
              configFile=${lib.escapeShellArg configPath}
              if [[ ! -e "$configFile" && ! -L "$configFile" ]]; then
                run mkdir -p -- "''${configFile%/*}"
                run install -m 600 -- ${lib.escapeShellArg initialConfig} "$configFile"
              fi
            '';
          };
        };

      nixosModules.default = { config, pkgs, lib, ... }: {
        options.programs.wallpaper-picker-ui.enable =
          lib.mkEnableOption "Wallpaper Picker UI system-wide";
        config = lib.mkIf config.programs.wallpaper-picker-ui.enable {
          environment.systemPackages = [ self.packages.${pkgs.stdenv.hostPlatform.system}.default ];
        };
      };
    };
}
