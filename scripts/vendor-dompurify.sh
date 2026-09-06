#!/bin/bash
set -e

# Re-vendor DOMPurify from the pinned npm package into the extension.
# Version is pinned exactly in package.json ("dompurify": "3.3.1") and locked
# in package-lock.json, so `npm install` fetches the same bytes every time.
# After running, verify the hash against extension/libs/VENDORED.md.

DEST="extension/libs/dompurify"
SRC="node_modules/dompurify/dist/purify.min.js"

echo "📦 Vendoring DOMPurify into $DEST ..."

if [ ! -f "$SRC" ]; then
  echo "❌ $SRC not found. Run 'npm install' first."
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC" "$DEST/purify.min.js"

echo "✅ DOMPurify vendored to $DEST/purify.min.js"
echo "   version: $(node -p "require('./node_modules/dompurify/package.json').version")"
echo "   sha256:  $(sha256sum "$DEST/purify.min.js" | cut -d' ' -f1)"
