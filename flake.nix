{
  description = "Wallpaper Picker UI — NixOS and Home Manager installation";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux"; # The upstream release only publishes an amd64 AppImage.
      pkgs = nixpkgs.legacyPackages.${system};
      lib = nixpkgs.lib;
      version = "3.4.0";

      # Install the published release, not a source build that downloads Bun and
      # Cargo dependencies inside Nix's network-isolated build sandbox.
      # Hash verified against the v3.4.0 GitHub release asset (and a local download).
      appImage = pkgs.fetchurl {
        url = "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v${version}/wallpaper-picker-ui_${version}_amd64.AppImage";
        hash = "sha256-i/cOKgfKNVgNbMi6jaJ70q2oFGnxTLnSXnZn6CebsBg=";
      };
      appImageContents = pkgs.appimageTools.extract {
        pname = "wallpaper-picker-ui";
        inherit version;
        src = appImage;
      };
      package = pkgs.appimageTools.wrapType2 {
        pname = "wallpaper-picker-ui";
        inherit version;
        src = appImage;
        nativeBuildInputs = [ pkgs.makeWrapper ];
        extraInstallCommands = ''
          # The app launches ffmpeg by name when making video thumbnails.
          wrapProgram "$out/bin/wallpaper-picker-ui" \
            --prefix PATH : ${lib.makeBinPath [ pkgs.ffmpeg ]}
          install -Dm444 ${appImageContents}/usr/share/applications/wallpaper-picker-ui.desktop \
            "$out/share/applications/wallpaper-picker-ui.desktop"
          install -Dm444 ${appImageContents}/usr/share/icons/hicolor/256x256/apps/wallpaper-picker-ui.png \
            "$out/share/icons/hicolor/256x256/apps/wallpaper-picker-ui.png"
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
            xdg.configFile."WallpaperPickerUI/config.json".text = builtins.toJSON {
              inherit (cfg) command debugMode newWallpapers darkMode language;
              wallpapersPath = if cfg.wallpapersPath == null then "" else cfg.wallpapersPath;
              thumbnailVersion = 1;
            };
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
