#!/usr/bin/env bash
# Regression: the default Nix package must link against Nixpkgs WebKitGTK,
# not run the Ubuntu-built AppImage WebKit inside a bubblewrap FHS environment.
set -euo pipefail

out=$(nix build .#default --no-link --print-out-paths)
test -x "$out/bin/wallpaper-picker-ui"
test -f "$out/share/applications/wallpaper-picker-ui.desktop"
test -f "$out/share/icons/hicolor/256x256/apps/wallpaper-picker-ui.png"

references=$(nix-store -q --references "$out")
case "$references" in
  *-webkitgtk-*) ;;
  *) printf 'Missing native WebKitGTK dependency: %s\n' "$out" >&2; exit 1 ;;
esac
case "$references" in
  *-bwrap*) printf 'Default package still depends on bubblewrap: %s\n' "$out" >&2; exit 1 ;;
esac
printf 'Native Nix package passed: %s\n' "$out"
