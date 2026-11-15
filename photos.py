"""Prepare photos for the site.

Drop photos in photos-in/, named after the diagram part they show (arm.jpg,
pump.heic, cam.png ...). This writes a resized JPEG with no location or other
metadata to photos/<part>.jpg. Originals in photos-in/ are left alone.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

root = Path(__file__).parent
src, out = root / "photos-in", root / "photos"
html = (root / "index.html").read_text(encoding="utf-8")
out.mkdir(exist_ok=True)
for f in sorted(src.glob("*")) if src.exists() else []:
    if f.suffix.lower() not in {".jpg", ".jpeg", ".png", ".heic", ".webp"}:
        continue
    key = f.stem.lower()
    if f'<template data-k="{key}"' not in html:
        print(f"skip {f.name}: no diagram part called '{key}'")
        continue
    dst = out / f"{key}.jpg"
    if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
        continue
    im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
    im.thumbnail((1600, 1600))
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{f.name} -> photos/{dst.name} ({dst.stat().st_size // 1024} KB)")
