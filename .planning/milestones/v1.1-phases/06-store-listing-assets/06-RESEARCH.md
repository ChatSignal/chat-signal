# Phase 6: Store Listing Assets - Research

**Researched:** 2026-02-19
**Domain:** Chrome Web Store listing copy, automated screenshot capture, programmatic image generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Store description copy**
- Lead with audience: "Built for streamers and moderators..." — audience-first hook
- Friendly, conversational tone — warm and approachable, not corporate
- Mention all applicable trust signals: free, no account needed, all processing stays local
- Bullet list format for the detailed description — one feature per line with brief explanation
- Must use approved trademark patterns ("works with YouTube" not "YouTube extension")

**Screenshot content**
- 3 screenshots, one per major feature area: clusters, sentiment/mood, trending topics
- Mock data injected programmatically — no real stream dependency
- Sidebar only, no stream page context — avoids trademark issues and keeps focus on the extension
- Dark mode only — matches what most streamers use, single consistent look

**Promotional image design**
- Logo + tagline style: extension icon/logo centered with tagline below
- Dark gradient background matching the extension's dark mode aesthetic
- Tagline: "See what your chat is saying"
- No platform logos (YouTube/Twitch) — avoids trademark issues entirely, just Chat Signal branding

**Asset production method**
- Screenshots: Puppeteer/Playwright script for automated, reproducible captures at exact 1280x800 dimensions
- Promotional image: SVG/HTML rendered to 440x280 PNG — version-controlled and reproducible
- Assets stored in `docs/store/` under GitHub Pages (web-accessible)
- Generation scripts kept in `scripts/` for future regeneration after UI changes

### Claude's Discretion

- Exact mock data content (realistic message examples, topic words, sentiment distribution)
- Specific gradient colors and typography for the promo image
- Which feature to emphasize in each of the 3 screenshots
- Puppeteer vs Playwright choice for the screenshot script

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STORE-01 | Store description copy using approved trademark patterns ("works with YouTube" not "YouTube extension") | YouTube Branding Guidelines + Twitch Trademark Policy confirm the approved descriptive phrasing; character limits and structure guidance from CWS best-listing docs |
| STORE-02 | Screenshots captured at 1280x800 showing sidebar in action (minimum 1, up to 5) | CWS image requirements confirm 1280x800 px preferred; Playwright/Puppeteer API supports exact viewport + setContent() for mock data injection |
| STORE-03 | Promotional image created at 440x280 | CWS confirms 440x280 PNG required; sharp library supports SVG-to-PNG at exact dimensions |
</phase_requirements>

## Summary

Phase 6 has three distinct work streams: writing compliant store copy, generating 1280x800 screenshots with programmatic mock data, and producing a 440x280 promotional image. The trademark constraints are well-defined by official Google and Twitch policy — descriptive phrasing like "for YouTube" and "compatible with Twitch" is explicitly approved while incorporating those names into your product's own name is prohibited. The user has already resolved the trademark risk for screenshots and the promo image by avoiding platform logos entirely.

For screenshot automation, Playwright is the better choice for this project (Node.js, already in the ecosystem via `package.json`, broader official support). The approach is: write an HTML template that mirrors the sidebar's markup and CSS, inject mock data directly into the DOM via `page.evaluate()`, set viewport to exactly 1280x800, and call `page.screenshot({ type: 'png' })`. No live stream or Chrome extension loading needed — just a local HTML file rendered by Playwright's bundled Chromium.

For the promotional image, SVG authored by hand with the dark gradient, icon, and tagline, then converted to 440x280 PNG using `sharp`. Sharp accepts SVG buffer input and outputs PNG at exact specified dimensions — no headless browser needed. The SVG source stays version-controlled in `scripts/` and is the single source of truth for future regeneration.

**Primary recommendation:** Use Playwright for screenshots (matches project's Node.js toolchain, better-supported API for setViewportSize + setContent) and sharp for the promotional PNG (no browser dependency, simple SVG→PNG pipeline). Keep both generation scripts in `scripts/` alongside `build.sh`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright | 1.58.2 | Headless Chromium to render sidebar HTML at exact 1280x800 and capture PNG | Industry standard for Node.js screenshot automation; bundles its own Chromium, no system browser dependency |
| sharp | 0.34.5 | Convert SVG string to 440x280 PNG for promo image | Zero headless-browser dependency for simple image ops; fast libvips-backed; npm standard for server-side image processing |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| puppeteer | 24.37.5 | Alternative to Playwright for screenshots | Only if Playwright proves problematic; API is nearly identical for this use case |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright | Puppeteer | Both work; Playwright has `page.setViewportSize()` and `page.setContent()` as first-class stable API, slightly more explicit for viewport control |
| sharp (SVG→PNG) | Playwright/Puppeteer render | sharp is lighter (no browser spawn) and sufficient for a static SVG promo image; only use browser rendering if the promo image requires dynamic layout |
| Hand-authored SVG | Canvas/node-canvas | SVG is human-editable, version-controllable, and scales cleanly; node-canvas adds native dependency complexity |

**Installation:**
```bash
npm install --save-dev playwright sharp
npx playwright install chromium  # downloads bundled Chromium
```

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── build.sh                    # existing WASM build
├── screenshot.mjs              # Playwright script: renders sidebar HTML → 3 PNGs
└── promo-image.mjs             # sharp script: SVG source → 440x280 PNG

docs/
└── store/
    ├── screenshot-clusters.png     # 1280x800
    ├── screenshot-mood.png         # 1280x800
    ├── screenshot-topics.png       # 1280x800
    └── promo-440x280.png           # 440x280

extension/sidebar/
├── sidebar.html                # existing — reused as template base
└── sidebar.css                 # existing — linked from screenshot template
```

### Pattern 1: Playwright Screenshot with Injected Mock Data

**What:** Load the sidebar HTML file, inject populated DOM state via `page.evaluate()`, force dark mode via CSS class, set viewport to 1280x800, screenshot.

**When to use:** Any time you need a screenshot of the extension UI without a running Chrome extension or live stream.

**Example:**
```javascript
// scripts/screenshot.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCREENSHOTS = [
  {
    name: 'screenshot-clusters',
    inject: injectClustersState,
  },
  {
    name: 'screenshot-mood',
    inject: injectMoodState,
  },
  {
    name: 'screenshot-topics',
    inject: injectTopicsState,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();

// Set exact CWS-required dimensions
await page.setViewportSize({ width: 1280, height: 800 });

// Load sidebar HTML from disk (Playwright resolves file:// correctly)
const sidebarPath = path.resolve(__dirname, '../extension/sidebar/sidebar.html');
await page.goto(`file://${sidebarPath}`);

// Force dark color scheme (extension uses prefers-color-scheme)
await page.emulateMedia({ colorScheme: 'dark' });

for (const { name, inject } of SCREENSHOTS) {
  // Inject mock data directly into the live DOM
  await page.evaluate(inject);

  await page.screenshot({
    path: path.resolve(__dirname, `../docs/store/${name}.png`),
    type: 'png',
    // No clip needed — viewport IS 1280x800
  });
}

await browser.close();
```

**Key pitfall:** The sidebar's CSS is loaded via a relative `<link>` tag referencing `sidebar.css`. When Playwright loads the file via `file://`, relative paths resolve correctly — no modification needed. If the sidebar links WASM or JS modules that fail to load (e.g., missing wasm/ dir), inject error-prevention guards in `page.addInitScript()` before navigation.

### Pattern 2: Inject DOM State Without Running the Extension

**What:** Use `page.evaluate()` to directly manipulate the already-loaded sidebar DOM, bypassing the JavaScript that normally drives it (content scripts, WASM analysis).

**Example:**
```javascript
async function injectClustersState() {
  // Run inside the page context — access to document, DOM APIs
  // Remove hidden class from sections that normally need WASM output
  document.getElementById('clusters').innerHTML = `
    <div class="cluster-bucket">
      <div class="cluster-header">
        <span class="cluster-label">Questions</span>
        <span class="cluster-count">12</span>
      </div>
      <div class="cluster-messages">
        <div class="message-item">What settings do you use for this?</div>
        <div class="message-item">How long have you been streaming?</div>
        <div class="message-item">Can you explain that mechanic?</div>
      </div>
    </div>
    <!-- additional buckets... -->
  `;
  document.getElementById('first-run').classList.add('hidden');
  document.getElementById('status').classList.add('active');
  document.getElementById('status-text').textContent = 'Analyzing 847 messages';
  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('processed-count').textContent = '847';
}
```

### Pattern 3: SVG → PNG with sharp

**What:** Author the promo image as an SVG string in the script, convert to exactly 440x280 PNG using sharp's buffer API.

**Example:**
```javascript
// scripts/promo-image.mjs
import sharp from 'sharp';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 440;
const HEIGHT = 280;

// Dark gradient matches extension's dark mode: bg-primary #1f2937, accent #3b82f6
const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#111827"/>
      <stop offset="100%" style="stop-color:#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <!-- Icon placeholder — replace with actual icon path data or embed PNG -->
  <circle cx="${WIDTH/2}" cy="${HEIGHT/2 - 30}" r="48" fill="#3b82f6" opacity="0.2"/>
  <text x="${WIDTH/2}" y="${HEIGHT/2 - 14}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="48" text-anchor="middle" fill="#3b82f6">📡</text>
  <!-- Product name -->
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 30}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="22" font-weight="600" text-anchor="middle" fill="#f9fafb">Chat Signal</text>
  <!-- Tagline -->
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 58}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="14" text-anchor="middle" fill="#9ca3af">See what your chat is saying</text>
</svg>
`;

await sharp(Buffer.from(svg))
  .resize(WIDTH, HEIGHT)   // enforces exact output dimensions
  .png()
  .toFile(path.resolve(__dirname, '../docs/store/promo-440x280.png'));

console.log('Promo image written to docs/store/promo-440x280.png');
```

**Note on emoji in SVG via sharp:** SVG text with emoji characters may not render via libvips (sharp's backend) — libvips does not include a full emoji font. Use a Unicode symbol character, a path-based icon, or embed the PNG icon as a base64 `<image>` element in the SVG instead of emoji glyphs. Alternatively: render the SVG with Playwright and screenshot instead.

### Pattern 4: Store Description Copy Structure

CWS "best-listing" guidance specifies:
- **Item Summary**: max 132 characters — one sentence, no superlatives, appears on search/category pages
- **Item Description**: no hard cap documented, but keyword spam policy applies; structure as overview paragraph then bullet list

**Approved trademark phrasing (verified from official sources):**
- YouTube: "works with YouTube", "for YouTube", "great app for YouTube" — per [YouTube API Services Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- Twitch: "compatible with Twitch", "for Twitch" — per [Twitch Trademark Policy](https://legal.twitch.com/legal/trademark/)
- Prohibited: Using "YouTube" or "Twitch" as part of your extension's own name or implying endorsement/authorization

**Draft store copy structure:**
```
ITEM SUMMARY (≤132 chars):
"Real-time chat analysis for streamers and moderators. Works with YouTube and Twitch live streams."

ITEM DESCRIPTION:
Built for streamers and moderators who want to understand what their community is talking about
in real time — without leaving their stream.

Chat Signal analyzes live chat and shows you:
• Questions from your audience — so nothing gets lost in the scroll
• Chat mood — see whether your stream is excited, positive, confused, or negative
• Trending topics — the words and emotes your community keeps repeating
• Session history — review what your chat talked about after the stream ends

Free. No account needed. All processing happens locally in your browser — no chat data ever
leaves your computer.

Works with YouTube and Twitch live streams.
```

### Anti-Patterns to Avoid

- **"YouTube Extension" in title or description:** Implies official relationship; Google's YouTube trademark policy explicitly prohibits this. Use "for YouTube" or "works with YouTube" instead.
- **emoji in SVG via sharp:** sharp/libvips does not bundle emoji fonts; emoji text will render as boxes or be dropped. Use path-based icons or embed as `<image>`.
- **Loading sidebar.js in screenshot context:** sidebar.js imports WASM and tries to connect to chrome runtime APIs — both will fail in a plain browser context. Use `page.addInitScript()` to stub out `chrome` global before navigation, or navigate and immediately override DOM via `page.evaluate()` before JS executes meaningful work.
- **deviceScaleFactor > 1 with 1280x800 viewport:** CWS screenshots must be exactly 1280x800 px. With deviceScaleFactor: 2 the output buffer is 2560x1600 — CWS will reject it. Keep deviceScaleFactor at 1 (Playwright default).
- **Text-heavy promo image:** CWS guideline says "avoid text" for promotional images. Keep tagline short; the icon/visual should carry the image.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exact-pixel screenshot at 1280x800 | Manual browser + native screenshot | Playwright `page.setViewportSize({width:1280,height:800})` + `page.screenshot()` | Pixel-exact, reproducible, no manual steps |
| SVG to PNG at exact dimensions | Custom canvas rendering | `sharp(Buffer.from(svgString)).resize(440,280).png().toFile(...)` | One library call; handles SVG rasterization via libvips |
| Dark mode forcing | CSS injection | `page.emulateMedia({ colorScheme: 'dark' })` | Playwright's built-in media emulation triggers `prefers-color-scheme: dark` correctly |
| Chrome extension API stubs | Full mock framework | Minimal `page.addInitScript(() => { window.chrome = { runtime: {}, storage: { local: {} } }; })` | Prevents sidebar.js from throwing before DOM injection |

**Key insight:** The "screenshot of a Chrome extension sidebar" problem is just "screenshot of an HTML page" — no Chrome extension loading required. Playwright rendering the sidebar HTML file directly is simpler and more reliable than loading it as an actual extension.

## Common Pitfalls

### Pitfall 1: sidebar.js Crashes Before DOM Injection

**What goes wrong:** sidebar.js runs `chrome.runtime.sendMessage()` on load, which throws immediately in a plain browser context. The page crashes/shows error before mock data injection.

**Why it happens:** Chrome extension APIs (`chrome.*`) don't exist in plain Chromium launched by Playwright.

**How to avoid:** Before navigating, inject a chrome stub:
```javascript
await page.addInitScript(() => {
  window.chrome = {
    runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} } },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
    sidePanel: {}
  };
});
await page.goto(`file://${sidebarPath}`);
```

**Warning signs:** Screenshot shows a blank page or JavaScript error overlay.

### Pitfall 2: Emoji/Unicode Glyph Rendering Failure in sharp SVG

**What goes wrong:** The emoji character (e.g., 📡) in the SVG is replaced by a square box or renders invisibly.

**Why it happens:** sharp uses libvips for SVG rasterization, which relies on system font fallbacks. Most Linux/CI environments lack emoji fonts (Noto Color Emoji etc.).

**How to avoid:** Replace emoji with a path-based icon or embed the existing extension icon as a base64-encoded `<image>` element:
```xml
<image href="data:image/png;base64,..." x="196" y="70" width="48" height="48"/>
```
To get the base64: `const iconB64 = (await readFile('extension/icons/icon48.png')).toString('base64');`

**Warning signs:** Generated PNG shows boxes or empty space where the icon should be.

### Pitfall 3: Wrong Output Dimensions from sharp

**What goes wrong:** Output PNG is larger or differently proportioned than 440x280.

**Why it happens:** If the SVG's `viewBox` doesn't match the `width`/`height` attributes, libvips may interpret dimensions differently.

**How to avoid:** Explicitly set both `width` and `height` on the `<svg>` element AND pass them to `.resize(440, 280)`. Use `fit: 'fill'` if aspect ratio differs from the SVG's natural ratio:
```javascript
sharp(Buffer.from(svg))
  .resize(440, 280, { fit: 'fill' })
  .png()
  .toFile(outPath);
```

**Warning signs:** Image appears with unexpected letterboxing or is cropped.

### Pitfall 4: CWS Rejects Screenshot for Wrong Dimensions

**What goes wrong:** CWS dashboard rejects screenshot upload.

**Why it happens:** Screenshots must be exactly 1280x800 (or exactly 640x400). No other dimensions accepted.

**How to avoid:** Do not use `fullPage: true` in `page.screenshot()` — it captures the full scrollable height, not the viewport. The sidebar is a `min-height: 100vh` layout; ensure all content fits in 800px or scroll/clip to show the best portion. If the sidebar content is taller than 800px, use `clip: { x: 0, y: 0, width: 1280, height: 800 }` to force exactly 800px tall.

**Warning signs:** Upload error message about image dimensions.

### Pitfall 5: Sidebar Width Too Narrow for Screenshot

**What goes wrong:** Screenshot at 1280x800 shows the sidebar panel rendered far too narrow (the sidebar is designed as a panel ~380px wide), with blank space on the right.

**Why it happens:** The sidebar HTML uses `max-width: 100%` within a container intended to be the sidebar panel width, not a full 1280px viewport.

**How to avoid:** In the screenshot script, set the `.container` div's width explicitly, or adjust the viewport to match the sidebar's natural width and scale for the screenshot:
```javascript
await page.evaluate(() => {
  document.body.style.maxWidth = '420px';
  document.body.style.margin = '0 auto';
  document.body.style.background = '#1f2937'; // fill dark bg on sides
});
```
Or set viewport to sidebar width (e.g., 420px wide) and scale up in post — but CWS requires 1280x800 exactly, so the viewport must be 1280x800. Use a wrapper background to fill the sides. Alternatively: set the sidebar container to fill 1280px so features are spread wider, or add a "context frame" around the sidebar with a dark background.

**Warning signs:** Screenshot looks like a narrow sidebar panel floating on a white background.

## Code Examples

Verified patterns from official sources:

### Playwright: Exact Viewport + Dark Mode + Screenshot
```javascript
// Source: playwright.dev/docs/api/class-page (verified 2026-02)
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();

// MUST set viewport BEFORE goto for consistent rendering
await page.setViewportSize({ width: 1280, height: 800 });

// Force dark color scheme before page loads
await page.emulateMedia({ colorScheme: 'dark' });

await page.goto(`file:///absolute/path/to/sidebar.html`);
await page.waitForLoadState('networkidle');

// Take 1280x800 PNG — viewport IS the screenshot size
await page.screenshot({ path: 'out.png', type: 'png' });

await browser.close();
```

### Playwright: Stub Chrome APIs
```javascript
// Must call addInitScript BEFORE page.goto()
await page.addInitScript(() => {
  window.chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      getURL: (p) => p,
    },
    storage: {
      local: {
        get: (_keys, cb) => cb && cb({}),
        set: () => {},
      },
    },
  };
});
```

### sharp: SVG Buffer → Exact-Dimension PNG
```javascript
// Source: sharp.pixelplumbing.com + verified npm 0.34.5 API
import sharp from 'sharp';

const svgBuffer = Buffer.from(`<svg width="440" height="280" ...>...</svg>`);

await sharp(svgBuffer)
  .resize(440, 280, { fit: 'fill' })
  .png()
  .toFile('docs/store/promo-440x280.png');
```

### CWS-Compliant Description Template
```
// Item Summary (≤132 chars — verify with character count before submitting):
Real-time chat analysis for streamers and moderators. Works with YouTube and Twitch live streams.
// ^ 97 chars — within limit

// Item Description:
Built for streamers and moderators who want to understand their chat in real time.

• Questions: Surfaces what your audience is asking so nothing gets lost in the scroll
• Mood: Shows whether chat is excited, positive, confused, or negative
• Trending Topics: Words and emotes your community keeps repeating
• Session History: Review what your chat talked about after the stream ends

Free. No account required. All processing happens locally — no data leaves your browser.

Works with YouTube and Twitch live streams.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual screenshot via OS tools | Playwright/Puppeteer automated scripts | ~2019 (headless chrome matured) | Reproducible, exact pixel dimensions, scriptable |
| Rasterize SVG with PhantomJS | sharp (libvips) or Playwright | ~2018 (PhantomJS deprecated) | PhantomJS is dead; sharp is the standard for server-side SVG→PNG |
| Puppeteer only | Playwright preferred (2024-2026) | ~2022 | Playwright has cleaner multi-browser API, better TypeScript types, same Chromium under the hood |

**Deprecated/outdated:**
- PhantomJS: Discontinued. Use sharp or Playwright.
- `page.setViewport()` (Puppeteer) vs `page.setViewportSize()` (Playwright): Different method names for same concept. Don't confuse them across libraries.

## Open Questions

1. **Sidebar width presentation at 1280px viewport**
   - What we know: The sidebar CSS uses `max-width: 100%` with `padding: 20px`; at 1280px it will render very wide, which may look odd
   - What's unclear: Whether a narrow sidebar on a dark background makes a better screenshot, or whether the full-width layout should be adjusted for the screenshot
   - Recommendation: Test both approaches in the screenshot script. A ~420px sidebar centered on a dark `#1f2937` background likely looks more authentic. Plan should call this out as a decision point.

2. **Emoji font availability in sharp/libvips**
   - What we know: libvips doesn't bundle emoji fonts; emoji glyphs in SVG text are unreliable
   - What's unclear: Whether the CI/local environment (Fedora 43) has Noto Color Emoji installed (`fc-list | grep -i emoji`)
   - Recommendation: Plan for the safe approach — embed the icon as a base64 PNG `<image>` element, not as emoji text.

3. **Exact long description character limit**
   - What we know: CWS "best-listing" docs don't state an explicit limit for the long description; keyword spam policy applies
   - What's unclear: Whether there's a soft or hard limit in the dashboard UI
   - Recommendation: Keep description under 1000 characters as a conservative target; verify in the dashboard during Phase 7.

## Sources

### Primary (HIGH confidence)
- [developer.chrome.com/docs/webstore/images](https://developer.chrome.com/docs/webstore/images) — screenshot and promo image dimensions, format requirements, content guidelines
- [developer.chrome.com/docs/webstore/best-listing](https://developer.chrome.com/docs/webstore/best-listing) — 132-char summary limit, description structure, keyword spam policy
- [developers.google.com/youtube/terms/branding-guidelines](https://developers.google.com/youtube/terms/branding-guidelines) — approved YouTube trademark phrasing ("for YouTube", "works with YouTube"); prohibited uses (app names incorporating YouTube trademark)
- [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/) — SVG input → PNG output API, resize with fit, buffer-based input
- [playwright.dev/docs/api/class-page](https://playwright.dev/docs/api/class-page) — `page.setViewportSize()`, `page.screenshot()` with clip, `page.emulateMedia()`

### Secondary (MEDIUM confidence)
- [legal.twitch.com/legal/trademark/](https://legal.twitch.com/legal/trademark/) — Twitch trademark policy; "compatible with Twitch" phrasing verified via WebSearch summary (page JS-rendered, content not directly extracted)
- npm registry: puppeteer@24.37.5, playwright@1.58.2, sharp@0.34.5 — current versions verified 2026-02-19

### Tertiary (LOW confidence)
- Community discussions on YouTube trademark enforcement in Chrome extension listings — confirmed enforcement exists but exact accepted vs rejected phrase boundaries rely on official docs above

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Playwright and sharp are well-documented, current versions verified from npm
- Architecture: HIGH — screenshot approach mirrors established pattern for extension store asset generation; SVG→PNG via sharp is textbook usage
- Pitfalls: MEDIUM — chrome API stub pattern is well-known but not from a single authoritative doc; sidebar width presentation issue is reasoned from CSS review, not tested
- Trademark copy: HIGH — YouTube and Twitch official trademark policies clearly state approved phrasing; risk is LOW when using descriptive "for/with" patterns and avoiding platform names in the product name

**Research date:** 2026-02-19
**Valid until:** 2026-08-19 (stable APIs; CWS policy changes quarterly — re-verify if >60 days)
