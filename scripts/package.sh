#!/bin/bash
set -e

ZIP_NAME="chat-signal.zip"

echo "🏗️  Building Chat Signal for CWS submission..."
echo ""

# 1. Build WASM
echo "Step 1/3: Building WASM engine..."
./scripts/build.sh

# 2. Vendor Transformers.js
echo ""
echo "Step 2/3: Vendoring Transformers.js..."
./scripts/vendor-transformers.sh

# 3. Create ZIP
echo ""
echo "Step 3/3: Packaging extension..."

# Remove old ZIP if it exists
rm -f "$ZIP_NAME"

cd extension
zip -r "../$ZIP_NAME" . \
  -x "*.DS_Store" \
  -x "__MACOSX/*" \
  -x "wasm/*.d.ts"
cd ..

echo ""
echo "✅ Package ready: $ZIP_NAME"
echo ""
echo "Upload this file to the Chrome Web Store developer dashboard."

# Show size
ls -lh "$ZIP_NAME"
