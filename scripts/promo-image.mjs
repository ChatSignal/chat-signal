/**
 * promo-image.mjs
 *
 * Generates the 440x280 promotional image for the Chrome Web Store listing.
 *
 * Design:
 * - Dark gradient background matching extension dark mode (#111827 to #1f2937, diagonal)
 * - Extension icon embedded as base64 PNG (avoids emoji font dependency in libvips)
 * - Product name "Chat Signal" in white (#f9fafb), 22px, weight 600
 * - Tagline "AI-powered live chat intelligence" in muted gray (#9ca3af), 14px
 *
 * Usage:
 *   node scripts/promo-image.mjs
 *
 * Output:
 *   docs/store/promo-440x280.png (exactly 440x280 px)
 */

import sharp from 'sharp';
import { readFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 440;
const HEIGHT = 280;

const OUTPUT_PATH = path.resolve(__dirname, '../docs/store/promo-440x280.png');
const ICON_PATH = path.resolve(__dirname, '../extension/icons/icon-128.png');

// Read extension icon and encode as base64 for SVG embed.
// This avoids emoji/Unicode glyph rendering issues with libvips (no emoji font required).
const iconBuffer = await readFile(ICON_PATH);
const iconB64 = iconBuffer.toString('base64');

// Icon display size and position (centered horizontally, upper portion)
const ICON_SIZE = 64;
const ICON_X = Math.round((WIDTH - ICON_SIZE) / 2);
const ICON_Y = 70;

// Text vertical positions
const PRODUCT_NAME_Y = ICON_Y + ICON_SIZE + 36;
const TAGLINE_Y = PRODUCT_NAME_Y + 26;

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Extension icon embedded as base64 PNG -->
  <image
    href="data:image/png;base64,${iconB64}"
    x="${ICON_X}"
    y="${ICON_Y}"
    width="${ICON_SIZE}"
    height="${ICON_SIZE}"
  />

  <!-- Product name -->
  <text
    x="${WIDTH / 2}"
    y="${PRODUCT_NAME_Y}"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="22"
    font-weight="600"
    text-anchor="middle"
    fill="#f9fafb"
  >Chat Signal</text>

  <!-- Tagline -->
  <text
    x="${WIDTH / 2}"
    y="${TAGLINE_Y}"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="14"
    text-anchor="middle"
    fill="#9ca3af"
  >AI-powered live chat intelligence</text>
</svg>`;

// Ensure output directory exists
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

// Convert SVG buffer to exactly 440x280 PNG via sharp/libvips
await sharp(Buffer.from(svg))
  .resize(WIDTH, HEIGHT, { fit: 'fill' })
  .png()
  .toFile(OUTPUT_PATH);

console.log(`Promo image written to docs/store/promo-440x280.png (${WIDTH}x${HEIGHT})`);
