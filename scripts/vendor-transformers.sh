#!/bin/bash
set -e

DEST="extension/libs/transformers"

echo "📦 Vendoring Transformers.js into $DEST ..."

if [ ! -d "node_modules/@huggingface/transformers/dist" ]; then
  echo "❌ node_modules/@huggingface/transformers not found. Run 'npm install' first."
  exit 1
fi

mkdir -p "$DEST"

# Copy only the files the extension needs:
#   transformers.js  — main ESM bundle (imported by encoder-adapter.js)
#   ort-wasm-simd-threaded.jsep.wasm — ONNX Runtime WASM backend
#   ort-wasm-simd-threaded.jsep.mjs  — ONNX Runtime JS glue
cp node_modules/@huggingface/transformers/dist/transformers.js "$DEST/"
cp node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm "$DEST/"
cp node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs "$DEST/"

echo "✅ Transformers.js vendored to $DEST/"
ls -lh "$DEST/"
