#!/bin/bash
set -e

ZIP_NAME="chat-signal.zip"

echo "🏗️  Building Chat Signal for CWS submission..."
echo ""

# 1. Install locked dev deps (reproducible: uses package-lock.json exactly)
echo "Step 1/4: Installing locked dependencies (npm ci)..."
npm ci --ignore-scripts

# 2. Build WASM
echo ""
echo "Step 2/4: Building WASM engine..."
./scripts/build.sh

# 3. Vendor Transformers.js
echo ""
echo "Step 3/4: Vendoring Transformers.js..."
./scripts/vendor-transformers.sh

# 4. Create ZIP
echo ""
echo "Step 4/4: Packaging extension..."

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
