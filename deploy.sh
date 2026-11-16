#!/usr/bin/env bash
# Build dist/ and deploy to Cloudflare Pages (meandelman.com).
# CSS/JS links get a content hash (?v=...) so browsers never run a stale copy:
# the domain lets browsers cache .js/.css for 4 hours.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python photos.py
cp styles.css main.js extras.js favicon.svg resume.pdf og.png 404.html sitemap.xml robots.txt dist/
cp -r fonts dist/
[ -d photos ] && cp -r photos dist/
cp -r vendor dist/
css=$(md5sum styles.css | cut -c1-8)
js=$(md5sum main.js | cut -c1-8)
xjs=$(md5sum extras.js | cut -c1-8)
sed -e "s#href=\"styles.css\"#href=\"styles.css?v=$css\"#" \
    -e "s#src=\"main.js\"#src=\"main.js?v=$js\"#"     -e "s#src=\"extras.js\"#src=\"extras.js?v=$xjs\"#" index.html > dist/index.html
# Attach each photos/<part>.jpg to the diagram note with the same key.
for f in photos/*.jpg; do
  [ -e "$f" ] || continue
  k=$(basename "$f" .jpg)
  sed -i "s#<template data-k=\"$k\">#<template data-k=\"$k\" data-photo=\"$f\">#" dist/index.html
done
# Minify the shipped CSS and JS (sources stay readable in the repo).
for f in main.js extras.js styles.css; do npx -y esbuild@0.24.2 "$f" --minify --log-level=warning --outfile="dist/$f" --allow-overwrite; done
npx wrangler pages deploy dist --project-name meandelman --branch main --commit-dirty=true
