#!/usr/bin/env bash
# Build dist/ and deploy to Cloudflare Pages (meandelman.com).
# CSS/JS links get a content hash (?v=...) so browsers never run a stale copy:
# the domain lets browsers cache .js/.css for 4 hours.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
cp styles.css main.js favicon.svg resume.pdf og.png 404.html dist/
[ -d photos ] && cp -r photos dist/
css=$(md5sum styles.css | cut -c1-8)
js=$(md5sum main.js | cut -c1-8)
sed -e "s#href=\"styles.css\"#href=\"styles.css?v=$css\"#" \
    -e "s#src=\"main.js\"#src=\"main.js?v=$js\"#" index.html > dist/index.html
npx wrangler pages deploy dist --project-name meandelman --branch main --commit-dirty=true
