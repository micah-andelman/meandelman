#!/usr/bin/env bash
# Build dist/ and deploy to Cloudflare Pages (meandelman.com).
# CSS/JS links get a content hash (?v=...) so browsers never run a stale copy:
# the domain lets browsers cache .js/.css for 4 hours.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python photos.py
cp styles.css layout.js main.js extras.js visuals.js otv3d.js favicon.svg resume.pdf og.png sitemap.xml robots.txt _headers dist/
cp -r fonts dist/
[ -d photos ] && cp -r photos dist/
cp -r vendor dist/
cp -r models dist/
css=$(md5sum styles.css | cut -c1-8)
js=$(md5sum main.js | cut -c1-8)
xjs=$(md5sum extras.js | cut -c1-8)
vjs=$(md5sum visuals.js | cut -c1-8)
ljs=$(md5sum layout.js | cut -c1-8)
ojs=$(md5sum otv3d.js models/otv.glb | md5sum | cut -c1-8)
# Every page gets the same hashed links and photo hookups.
for page in index.html otv.html brimcam.html pluto.html 404.html; do
  sed -e "s#href=\"\(/\?\)styles.css\"#href=\"\1styles.css?v=$css\"#" -e "s#src=\"\(/\?\)main.js\"#src=\"\1main.js?v=$js\"#" -e "s#src=\"\(/\?\)extras.js\"#src=\"\1extras.js?v=$xjs\"#" -e "s#src=\"\(/\?\)visuals.js\"#src=\"\1visuals.js?v=$vjs\"#" -e "s#src=\"\(/\?\)layout.js\"#src=\"\1layout.js?v=$ljs\"#" -e "s#src=\"\(/\?\)otv3d.js\"#src=\"\1otv3d.js?v=$ojs\"#" "$page" > "dist/$page"
  # Attach each photos/<part>.jpg to the diagram note with the same key.
  for f in photos/*.jpg; do
    [ -e "$f" ] || continue
    k=$(basename "$f" .jpg)
    sed -i "s#<template data-k=\"$k\">#<template data-k=\"$k\" data-photo=\"$f\">#" "dist/$page"
  done
done
# Minify the shipped CSS and JS (sources stay readable in the repo).
for f in layout.js main.js extras.js visuals.js otv3d.js styles.css; do npx -y esbuild@0.24.2 "$f" --minify --log-level=warning --outfile="dist/$f" --allow-overwrite; done
npx wrangler pages deploy dist --project-name meandelman --branch main --commit-dirty=true
