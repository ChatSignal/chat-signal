#!/usr/bin/env bash
# vendor-transformers.sh
# Copies Transformers.js + ONNX WASM files from node_modules to extension/libs/transformers/
# Run this after 'npm install' or when upgrading @huggingface/transformers.
# Idempotent: safe to run multiple times.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TRANSFORMERS_DIST="$PROJECT_ROOT/node_modules/@huggingface/transformers/dist"
DEST="$PROJECT_ROOT/extension/libs/transformers"

echo "Vendoring Transformers.js..."

# Check source exists
if [ ! -d "$TRANSFORMERS_DIST" ]; then
  echo "ERROR: $TRANSFORMERS_DIST not found. Run 'npm install' first." >&2
  exit 1
fi

# Create dest dir (idempotent)
mkdir -p "$DEST"

# Copy main bundle
cp "$TRANSFORMERS_DIST/transformers.js" "$DEST/"
echo "  Copied: transformers.js"

# Copy all ONNX WASM and MJS companion files
# Glob is intentional — file list changes between Transformers.js releases
WASM_COUNT=0
for f in "$TRANSFORMERS_DIST"/ort-wasm*.wasm; do
  [ -f "$f" ] || continue
  cp "$f" "$DEST/"
  echo "  Copied: $(basename "$f")"
  WASM_COUNT=$((WASM_COUNT + 1))
done

MJS_COUNT=0
for f in "$TRANSFORMERS_DIST"/ort-wasm*.mjs; do
  [ -f "$f" ] || continue
  cp "$f" "$DEST/"
  echo "  Copied: $(basename "$f")"
  MJS_COUNT=$((MJS_COUNT + 1))
done

TOTAL=$((1 + WASM_COUNT + MJS_COUNT))
echo ""
echo "Done. Copied $TOTAL files to $DEST"
echo "  1 bundle file (transformers.js)"
echo "  $WASM_COUNT WASM file(s)"
echo "  $MJS_COUNT MJS file(s)"
