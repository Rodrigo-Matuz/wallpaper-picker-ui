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

        # ── Bun (project's package manager + script runner) ─────────────────
        bun = pkgs.bun;

        # ── Rust toolchain (system Rust, no rustup needed) ─────────────────
        rustPlatform = pkgs.rustPlatform;

        # ── Linux system deps for Tauri 2 ──────────────────────────────────
        # Tauri 2's WebView on Linux needs WebKitGTK 4.1 + ancillary libs.
        linux-deps = with pkgs; [
          webkit2gtk-4.1      # WebView backend
          libappindicator3    # tray icons (some DEs)
          librsvg             # SVG icon rendering
          openssl             # TLS (updater, network)
          pkg-config          # used by cargo to find system libs
          clang               # native bindings / node-rs may need a C compiler
          libclang
          icu69               # full ICU for emoji / i18n
          icu-data-en
        ];

        host-deps = if pkgs.stdenv.isLinux then linux-deps else [];

        # ── Dev shell (`nix develop`) ───────────────────────────────────────
        devShell = pkgs.mkShell {
          name = "wallpaper-picker-ui-dev";
          buildInputs = host-deps ++ [
            bun
            rustPlatform
            pkgs.pkg-config
            pkgs.openssl
            pkgs.openssl.dev
          ];

          # Tauri's Rust crates look for OpenSSL via these vars
          OPENSSL_DIR = "${pkgs.openssl.dev}";
          OPENSSL_LIB_DIR = "${pkgs.openssl.outPath}/lib";
          OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";

          # Writable paths (Nix store is read-only)
          BUN_INSTALL = "$PWD/.bun";
          CARGO_HOME  = "$PWD/.cargo";
          RUSTUP_HOME = "$PWD/.rustup";

          # SSL certs for HTTPS (updater, API calls)
          SSL_CERT_DIR = "${(pkgs.certificate-transparency or pkgs.cacert or pkgs.curl).outPath}/etc/ssl/certs";

          shellHook = ''
            export PATH="$BUN_INSTALL/bin:$CARGO_HOME/bin:$PATH"

            echo "╔══════════════════════════════════════╗"
            echo "║  wallpaper-picker-ui dev shell       ║"
            echo "╚══════════════════════════════════════╝"
            echo ""
            echo "  bun  → $(bun --version 2>/dev/null || echo '(not found)')"
            echo "  rust → $(rustc --version 2>/dev/null || echo '(not found)')"
            echo ""
            echo "  Commands:"
            echo "    bun run dev          — start Vite dev server"
            echo "    bun run build        — build frontend (SvelteKit static output)"
            echo "    bun run tauri build  — build full Tauri app + bundles"
            echo "    bun run check        — svelte-check type checking"
            echo "    bun run lint         — Biome lint / format"
            echo "    bun test             — run unit tests"
            echo "    bun run version 3.4.1  — bump version in all 3 files"
            echo ""
          '';
        };

        # ── Default package (`nix build`) ───────────────────────────────────
        # Builds the complete Tauri app and produces Linux bundles (deb/rpm/
        # appimage) under ./result.
        app = pkgs.stdenvNoCC.mkDerivation {
          name = "wallpaper-picker-ui";
          src = ./.;
          vendorHash = null; # Nix will tell you the real hash on first build

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

          # Writable homes for package managers (Nix store is read-only)
          BUN_INSTALL = "$TMPDIR/bun-home";
          CARGO_HOME  = "$TMPDIR/cargo";
          RUSTUP_HOME = "$TMPDIR/rustup";

          buildPhase = ''
            runHook preBuild

            export PATH="$BUN_INSTALL/bin:$CARGO_HOME/bin:$PATH"

            # Install JS dependencies (frozen lockfile → reproducible)
            bun install --frozen-lockfile

            # Build the SvelteKit static output (consumed as Tauri's frontendDist)
            bun run build

            # Build the full Tauri app — produces binaries + Linux bundles
            bun run tauri build --no-warn

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"

            # Tauri places bundles under src-tauri/target/release/bundle/
            if [ -d "src-tauri/target/release/bundle" ]; then
              cp -r src-tauri/target/release/bundle/* "$out/"
            fi

            # Also expose the bare platform binary
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
      in {
        # ── Top-level flake attributes ──────────────────────────────────────
        packages = {
          default = app;        # `nix build` → Linux bundles in ./result
          app = app;            # explicit alias
        };

        devShells = {
          default = devShell;   # `nix develop`
        };

        # ── NixOS module ────────────────────────────────────────────────────
        # Drop into your NixOS config:  { programs.wallpaper-picker-ui.enable = true; }
        # The module references self.packages.${system}.default (the flake's
        # own app package), not pkgs.wallpaper-picker-ui.
        nixosModules.default = ({ config, pkgs, ... }:
          let
            wallpaper-picker-ui = self.packages.${pkgs.system}.default;
          in
          {
            options.programs.wallpaper-picker-ui = {
              enable = pkgs.lib.mkOption {
                type = pkgs.lib.types.bool;
                default = false;
                description = "Install wallpaper-picker-ui system-wide.";
              };
            };

            config = pkgs.lib.mkIf config.programs.wallpaper-picker-ui.enable {
              environment.systemPackages = [ wallpaper-picker-ui ];
            };
          }
        );

        # ── Legacy / flake-index compatibility ──────────────────────────────
        # Some tools expect a `packages.${system}.default`; we already
        # provide that above.  This overlay lets other flakes consume
        # this flake's package via `inputs.wallpaper-picker-ui.packages.${system}.default`.
        overlays = [
          (self: super: {
            wallpaper-picker-ui = self.packages.${system}.default or null;
          })
        ];
      }
    );
}
