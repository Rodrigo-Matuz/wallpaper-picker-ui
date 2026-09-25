#!/usr/bin/env python3
"""Regenerate all Tauri + web app icons from a single source PNG.

Reads Icon.png from the project root, then writes every icon file the
project needs — Tauri bundle icons (ICO, ICNS, PNGs), static web icons
(favicon, icon-256), and the src-tauri/icon.png fallback — all derived
from that one image.  ICO and ICNS get multiple embedded resolutions;
every PNG is resized to its exact target dimensions with high-quality
Lanczos resampling.

Run from the repo root (F:/Repos/wallpaper-picker-ui).
"""

import struct
import os
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
ICON_SRC = REPO / "Icon.png"
ICONS_DIR = REPO / "src-tauri" / "icons"
STATIC_DIR = REPO / "static"


# ---------------------------------------------------------------------------
# Size tables
# ---------------------------------------------------------------------------

# PNG files that live in src-tauri/icons/ and their exact pixel dimensions.
# Ordered biggest-first so the "from biggest to smallest" request is honored.
TAURI_PNG_SIZES = [
    ("icon.png",          512),
    ("128x128@2x.png",    256),   # 2x variant of 128 (renders as 128 on screen)
    ("128x128.png",       128),
    ("Square310x310Logo.png", 310),
    ("Square284x284Logo.png", 284),
    ("Square150x150Logo.png", 150),
    ("Square142x142Logo.png", 142),
    ("Square107x107Logo.png", 107),
    ("Square89x89Logo.png",   89),
    ("Square71x71Logo.png",   71),
    ("Square44x44Logo.png",   44),
    ("Square30x30Logo.png",   30),
    ("32x32.png",             32),
    ("StoreLogo.png",         50),   # StoreLogo is 50x50 (Windows Store convention)
]

# Web / static icons
STATIC_PNG_SIZES = [
    ("icon-256.png", 256),
    ("favicon.png",  100),
]

# ICO embedded resolutions (Windows wants several sizes in one .ico)
ICO_EMBEDDED = [16, 32, 48, 256]

# ICNS embedded resolutions (macOS)
ICNS_EMBEDDED = [16, 32, 64, 128, 256, 512, 1024]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def resize_and_save(src: Image.Image, dst: Path, size: int, suffix: str = "") -> None:
    """Resize ``src`` to ``size x size`` and write to ``dst`` as PNG."""
    if src.mode != "RGBA":
        src = src.convert("RGBA")
    im = src.resize((size, size), Image.LANCZOS)
    # Optional suffix allows naming variants without re-reading the table
    out = dst.parent / (dst.stem + suffix + dst.suffix) if suffix else dst
    im.save(out, "PNG")
    print(f"  written  {out.relative_to(REPO)}  ({size}x{size})")


def make_ico(src: Image.Image, dst: Path, sizes: list[int]) -> None:
    """Write a multi-resolution Windows .ico file."""
    entries = []
    for s in sizes:
        im = src.resize((s, s), Image.LANCZOS)
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        png_bytes = bytearray()
        # minimal PNG encoder via PIL's save to BytesIO
        import io
        buf = io.BytesIO()
        im.save(buf, "PNG")
        png_bytes = buf.getvalue()
        entries.append((s, s, 0, png_bytes))  # (w, h, bpp, data)

    # ICO header
    # -- 0-1: reserved 0x0000
    # -- 2-3: type 1 (ICO)
    # -- 4-5: image count
    # For each entry (16 bytes):
    #   0-1: width  (0 = 256)
    #   2-3: height (0 = 256)
    #   4:   color palette (0 = no palette, 256+ colors → 0 for PNG)
    #   5:   reserved
    #   6-7: color planes (0 for PNG)
    #   8-9: bits per pixel (0 for PNG)
    #   10-13: size of image data
    #   14-17: offset to image data

    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)

    # Compute offsets
    entry_size = 16 * count
    data_offset = entry_size + 6  # 6 = header size
    offset = data_offset
    entry_buf = bytearray()
    image_data = bytearray()
    for (w, h, bpp, data) in entries:
        w_field = 0 if w == 256 else w
        h_field = 0 if h == 256 else h
        entry_buf += struct.pack("<BBBBHHII", w_field, h_field, 0, 0, 0, 0, len(data), offset)
        image_data += data
        offset += len(data)

    with open(dst, "wb") as f:
        f.write(header)
        f.write(entry_buf)
        f.write(image_data)

    print(f"  written  {dst.relative_to(REPO).as_posix()}  (ICO: {', '.join(str(s) for s in sizes)}px)")


def make_icns(src: Image.Image, dst: Path, sizes: list[int]) -> None:
    """Write a multi-resolution macOS .icns file."""
    import io

    # ICNS header: magic "ICNS" (4), file size (4), then type+length blocks.
    blocks = bytearray()
    for s in sizes:
        im = src.resize((s, s), Image.LANCZOS)
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        buf = io.BytesIO()
        im.save(buf, "PNG")
        png_data = buf.getvalue()

        # ICNS block type for PNG is "ic09" (8-byte alignment: type 4 + length 4)
        type_code = b"ic09"
        length = len(png_data)
        blocks += type_code
        blocks += struct.pack(">I", length)  # big-endian length
        blocks += png_data
        # Pad to 4-byte boundary
        if len(png_data) % 4:
            blocks += b"\x00" * (4 - len(png_data) % 4)

    total_size = 8 + len(blocks)  # 8 = magic + total length field
    with open(dst, "wb") as f:
        f.write(b"ICNS")
        f.write(struct.pack(">I", total_size))
        f.write(blocks)

    print(f"  written  {dst.relative_to(REPO).as_posix()}  (ICNS: {', '.join(str(s) for s in sizes)}px)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not ICON_SRC.exists():
        print(f"ERROR: {ICON_SRC} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Source: {ICON_SRC.relative_to(REPO)}")

    src = Image.open(ICON_SRC)
    if src.mode != "RGBA":
        src = src.convert("RGBA")
    print(f"  original size: {src.size[0]}x{src.size[1]}, mode: {src.mode}")
    print()

    # --- src-tauri/icons/ PNGs (biggest first) ---
    print("==> src-tauri/icons/ PNG files")
    for name, size in TAURI_PNG_SIZES:
        dst = ICONS_DIR / name
        resize_and_save(src, dst, size)

    # --- static/ PNGs ---
    print("\n==> static/ PNG files")
    for name, size in STATIC_PNG_SIZES:
        dst = STATIC_DIR / name
        resize_and_save(src, dst, size)

    # --- Windows .ico (multi-resolution) ---
    print("\n==> src-tauri/icons/icon.ico (multi-resolution)")
    make_ico(src, ICONS_DIR / "icon.ico", ICO_EMBEDDED)

    # --- macOS .icns (multi-resolution) ---
    print("\n==> src-tauri/icons/icon.icns (multi-resolution)")
    make_icns(src, ICONS_DIR / "icon.icns", ICNS_EMBEDDED)

    print("\nDone — all icons regenerated from Icon.png.")


if __name__ == "__main__":
    main()
