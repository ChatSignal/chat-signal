# Stack Research — CWS Publication Readiness

**Domain:** Chrome Web Store submission for an existing MV3 Chrome extension
**Researched:** 2026-02-19
**Milestone:** v1.1 — CWS Readiness (subsequent milestone, not greenfield)
**Confidence:** HIGH

---

## Scope

The existing extension stack (Rust/WASM, vanilla JS, MV3) is frozen. This research covers only what is
needed to get the extension through Chrome Web Store review and published:

1. Privacy policy generation and hosting
2. Store listing assets (screenshots, promotional images)
3. Manifest permission review tooling
4. CWS developer dashboard requirements
5. Disk-space warning before WebLLM model download

No new runtime dependencies. No framework changes. No build pipeline changes.

---

## Recommended Stack

### Core Technologies (new for this milestone)

| Technology | Version/Cost | Purpose | Why Recommended |
|------------|-------------|---------|-----------------|
| GitHub Pages | Free | Privacy policy hosting | Permanent HTTPS URL at no cost; same GitHub org as the repo; no third-party service dependency; markdown-to-HTML trivially |
| Chrome Web Store Developer Account | $5 one-time | Publishing account | Required to publish; one-time fee covers all future extensions; 2-step verification mandatory |
| `navigator.storage.estimate()` | Web API (no version) | Disk space check before WebLLM download | Built-in browser API; no permission required; returns `quota` and `usage` in bytes; correct approach for checking available space |

### Supporting Libraries (none new at runtime)

No new runtime libraries are needed. The existing stack (DOMPurify 3.3.1, chrome.storage.sync,
wasm-bindgen) already satisfies all technical requirements.

`navigator.storage.estimate()` is a standard Web Storage API available in all Chromium-based
browsers — no npm install, no vendoring.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| CRXcavator (crxcavator.io) | Automated permission risk scoring before submission | Scans extension ZIP and reports permission risk, vulnerable JS libs, weak CSP; run before submitting to catch issues reviewers flag |
| Chrome DevTools — Extension unpacked load | Manual incognito verification | Load extension in incognito window via `chrome://extensions` → verify side panel opens, storage works, WASM loads |
| Hotpot.ai / appscreenshots.net | Screenshot framing templates | Free browser-based tools; produce 1280x800 PNGs with device frames and annotation text without Figma or Photoshop |
| Playwright or Puppeteer (local, no install needed via `npx`) | Automated screenshot capture at exact 1280x800 | `npx playwright screenshot` with `--viewport-size=1280,800`; no global install required; captures real extension UI |

---

## CWS Developer Dashboard Requirements

### Account Setup (one-time)

- **Registration fee:** $5 USD one-time. Covers up to 20 extensions permanently.
- **2-Step Verification:** Mandatory before any publish action. Enable on the Google Account used for the developer dashboard.
- **Dedicated email recommended:** Official docs suggest an address you check frequently; alerts about policy violations go here.
- **Limit:** 20 extensions per account.

### Store Listing — Required Fields

| Field | Requirement | Notes |
|-------|------------|-------|
| Extension name | Must match `manifest.json` `"name"` | "Chat Signal Radar" — already set |
| Short description | Max 132 characters | Displayed in search results and category pages; write this separately from the manifest description |
| Detailed description | No published hard limit; plain text only (no markdown, no HTML) | Newlines rendered as line breaks; write for humans not search engines |
| Category | Single selection from Google's list | "Productivity" is the correct category for this extension |
| Language | Primary language | "English" |
| Screenshots | Minimum 1, maximum 5; 1280x800 px preferred (640x400 also accepted); square corners, no padding | At least 1 required; PNG or JPEG |
| Small promotional tile | 440x280 px, PNG or JPEG | Required for listing to go live |
| Marquee promotional tile | 1400x560 px, PNG or JPEG | Optional; only relevant if Google features the extension |
| Store icon | 128x128 px PNG (already in manifest) | Already exists as `icons/icon-128.png` |
| Privacy policy URL | Public HTTPS URL | Required because the extension handles user data (chat messages, session history, AI model consent) |

### Privacy Tab — Required Fields

| Field | What to Enter |
|-------|--------------|
| Single purpose description | One sentence. Example: "Analyzes YouTube and Twitch live chat in real-time to surface top questions, issues, requests, sentiment, and trending topics." |
| Permissions justification — `sidePanel` | "Required to display the analysis dashboard in Chrome's built-in side panel while the user browses YouTube or Twitch." |
| Permissions justification — `storage` | "Required to persist user settings (analysis thresholds, AI preferences) via chrome.storage.sync and to store session history via chrome.storage.local." |
| Permissions justification — `host_permissions` (youtube.com, twitch.tv) | "Required for the content script to observe the chat DOM on YouTube and Twitch live streams. No data is sent to external servers from this observation." |
| Remote code declaration | Declare that `connect-src` allows huggingface.co and cdn-lfs.huggingface.co; justify as: "WebLLM optionally downloads an AI model (~400MB) from Hugging Face CDN only after explicit user consent. This is a model file download, not executable code." |
| Data use checkboxes | Check: "User activity" (chat messages are read for analysis); check "Website content" (DOM is observed). Do NOT check financial data, health data, authentication info. |

### Distribution Tab

| Field | Setting |
|-------|---------|
| Visibility | Public |
| Geographic distribution | All regions (no restrictions needed) |
| Pricing | Free |

---

## Privacy Policy

### What to Write

The extension handles these data categories — all must be disclosed:

| Data | Collection | Storage | Sharing |
|------|-----------|---------|---------|
| Chat messages (YouTube/Twitch) | Read from DOM in real-time for analysis | Not persisted; analyzed in-memory and discarded | Never; all analysis is local (WASM) |
| Session summaries | Generated from analyzed messages | Stored in `chrome.storage.local` on user's device | Never |
| User settings | Set by user in options page | Stored in `chrome.storage.sync` (syncs across user's Chrome devices) | Never |
| AI model consent preference | User's choice to enable/disable WebLLM | Stored in `chrome.storage.sync` | Never |
| WebLLM model files | Downloaded from Hugging Face CDN only if user consents | Cached by browser; not accessed by extension developers | Not shared; downloaded directly from Hugging Face |

**No personal data is collected by the extension developer.** No analytics, no telemetry, no external server calls (except the optional user-initiated Hugging Face model download).

### Hosting — Use GitHub Pages

**Why GitHub Pages over privacy policy generators:**

Policy generator services (TermsFeed, Termly, privacypolicies.com) produce generic policies with boilerplate about services this extension does not use (cookies, third-party analytics, advertising). They also often add branding and links back to their own service. A hand-written policy hosted on GitHub Pages is shorter, more accurate, and more credible to CWS reviewers.

**Implementation:**

1. Create `docs/privacy-policy.md` in the repository root (or a `gh-pages` branch).
2. Enable GitHub Pages in the repo settings: source = `docs/` folder or `gh-pages` branch.
3. The policy URL becomes `https://[username].github.io/chat-signal-radar/privacy-policy` (permanent, HTTPS, no expiry).
4. Link this URL in the CWS developer dashboard privacy policy field.

**What NOT to use for hosting:**

- TermsFeed / Termly / privacypolicies.com — generic boilerplate, third-party branding, may add clauses about data collection that don't apply
- Google Sites — works but less credible than a project's own domain
- Notion / Google Docs public link — these have been rejected by CWS reviewers for being mutable and requiring a Google login; HTTPS static URL is required
- Pastebin / Gist — not appropriate for a legal policy document

---

## Screenshot Requirements

### Dimensions and Format

- **Required:** 1280x800 px (preferred) or 640x400 px
- **Format:** PNG or JPEG; square corners; no padding; full bleed
- **Quantity:** Minimum 1, maximum 5
- **Small promotional tile:** 440x280 px (required separately from screenshots)

### What to Capture

The extension is a Chrome side panel — not a popup or new tab. Screenshots must show the actual UI:

| Screenshot | Content | Why |
|-----------|---------|-----|
| 1 (required) | Side panel open on a YouTube live stream, showing cluster buckets (Questions/Issues/Requests/General) with real content | Shows the core value proposition immediately |
| 2 | Trending topics section + sentiment mood indicator | Shows analysis depth |
| 3 | Session history tab with past sessions listed | Shows persistence feature |
| 4 | Options page with configurable threshold sliders | Shows configurability |
| 5 (optional) | WebLLM AI summary card (if WebLLM is set up) | Shows AI feature |

### How to Capture

**Option A — Manual (simplest):** Open a YouTube or Twitch live stream, activate the side panel, resize Chrome to approximately 1600px wide so the side panel fills the right ~400px, take a full-browser screenshot, then crop to 1280x800. Use Chrome's built-in screenshot (`Ctrl+Shift+P` → "Capture screenshot") or OS screenshot tools.

**Option B — Automated with Playwright (reproducible):**

```bash
npx playwright screenshot \
  --browser chromium \
  --viewport-size 1280,800 \
  [url] \
  screenshot.png
```

Playwright can load the unpacked extension and navigate to the side panel HTML directly:
`chrome-extension://[id]/sidebar/sidebar.html` — this produces a clean 1280x800 capture of
the sidebar UI in isolation, which is acceptable for store screenshots.

**Option C — Framing tools:** Hotpot.ai and appscreenshots.net provide free Chrome-device-frame
templates at 1280x800 with text annotation. Upload a raw sidebar screenshot and export a
framed marketing version. These are suitable for the promotional tiles.

---

## Manifest Permission Review

### Current Manifest Analysis

```json
"permissions": ["sidePanel", "storage"],
"host_permissions": ["https://www.youtube.com/*", "https://www.twitch.tv/*"]
```

**Assessment: Minimal and well-justified.** This permission set is among the smallest possible for
a content-reading extension. No broad `<all_urls>`, no `tabs`, no `history`, no `cookies`,
no `webRequest`, no `scripting` — all high-risk permissions that trigger extended review.

### CSP Concern — connect-src External Domains

The current `content_security_policy` in `manifest.json`:

```json
"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;"
```

**Risk:** The `connect-src` directive allowing `huggingface.co` and `cdn-lfs.huggingface.co` will
be scrutinized by reviewers. The key distinction: `connect-src` controls `fetch()`/`XMLHttpRequest`
connections (data downloads), while `script-src` controls code execution. Downloading model weights
from Hugging Face is a data download, not remote code execution — so it does not violate the MV3
remote code policy. However, reviewers may ask for justification.

**In the permissions justification field, explicitly state:** "The `connect-src` directive allows
downloading the optional WebLLM AI model (~400MB) from Hugging Face CDN only after explicit user
consent (consent modal on first run). No code is fetched or executed remotely — only binary model
weight files are downloaded. All extension logic is self-contained in the package."

**`raw.githubusercontent.com` in connect-src:** This is riskier from a reviewer's perspective than
Hugging Face because GitHub raw content could theoretically contain scripts. If this URL is unused
(no fetch to raw.githubusercontent.com in the extension code), remove it from `connect-src`.
Verify by grepping: `grep -r "raw.githubusercontent" extension/`.

### Permission Review Tooling

**Primary: Manual review against the policy.** The most reliable check is reading the
[Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
and the [MV3 requirements page](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
against the actual manifest.

**Secondary: CRXcavator.** Upload the extension ZIP at [crxcavator.io](https://crxcavator.io/) for
an automated risk score before submitting. It checks permission risk level, CSP weaknesses, and
third-party JS library vulnerabilities. Run this before each submission attempt.

**What NOT to use:** There is no official Google tool for pre-submission manifest validation.
Browser-based linters like "Extension Auditor Pro" or "CRX Inspector" inspect installed extensions,
not pre-submission ZIPs — they are not useful for validation before upload.

---

## Disk Space Warning — WebLLM Model Download

### Current State

The extension already has a user consent modal before the WebLLM model downloads. The active
requirement is to add a **disk space warning** (showing the ~400MB size) before the download begins.

### Recommended Approach

Use `navigator.storage.estimate()` — no new permission required.

```javascript
// In llm-adapter.js or the consent modal handler, before triggering download:
async function checkDiskSpaceBeforeDownload() {
  const MODEL_SIZE_BYTES = 420 * 1024 * 1024; // ~420MB conservative estimate

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { quota, usage } = await navigator.storage.estimate();
    const available = quota - usage;

    if (available < MODEL_SIZE_BYTES) {
      const availableMB = Math.round(available / (1024 * 1024));
      return {
        sufficient: false,
        availableMB,
        requiredMB: 420,
      };
    }
  }

  // Storage API unavailable or space is sufficient
  return { sufficient: true };
}
```

Show the result in the consent modal:

- If space is sufficient: "This will download approximately 400MB. Proceed?"
- If space is insufficient: "This requires approximately 400MB. You have approximately {N}MB available. Free up disk space before enabling AI features."

**Why `navigator.storage.estimate()` over `chrome.system.storage`:**

`chrome.system.storage` requires adding `"system.storage"` to the manifest permissions array.
Adding any new permission to an already-approved extension triggers re-review. `navigator.storage.estimate()`
is a standard Web API available in extension pages without any permission declaration. The tradeoff
is that `navigator.storage.estimate()` returns browser-quota headroom (Chrome caps quota at 60% of
disk, reports that as the maximum), not raw OS free disk space — but it is conservative and safe:
if the API says there's 400MB of quota space available, the download will succeed.

**Note:** The estimate is not exact physical disk space. For a ~400MB model, the error margin is
acceptable. The UX goal is preventing a failed download that corrupts the cache, not auditing exact
disk geometry.

---

## Incognito Mode Verification

### Current Manifest Setting

The manifest does not declare an `"incognito"` key, which defaults to `"spanning"` mode.

**Spanning mode implications:**
- The background service worker runs in a single shared process
- `chrome.storage.sync` and `chrome.storage.local` are shared between regular and incognito contexts (confirmed in Chrome docs)
- The side panel can be opened in incognito tabs when the user enables the extension for incognito

### What to Verify Manually

| Component | What to Check | Expected Result |
|-----------|--------------|-----------------|
| `chrome.storage.sync` | Open options page in incognito, change a setting, verify it persists | Settings save and load correctly |
| `chrome.storage.local` | Open sidebar in incognito, start a session, end it, check history | Session saves to history |
| WASM loading | Open sidebar in incognito | WASM initializes without CSP errors |
| Side panel | Navigate to YouTube in incognito, click extension icon | Side panel opens and displays UI |
| Content script | Open a YouTube live stream in incognito | Chat messages flow into the sidebar |

**How to enable the extension in incognito for testing:**
`chrome://extensions` → Chat Signal Radar → Details → toggle "Allow in incognito" → ON.

### Do NOT Change the Manifest Incognito Setting

Leaving `"incognito"` unset (defaulting to `"spanning"`) is correct for this extension. The
extension does not need separate state for incognito vs. regular windows — user settings should
roam across both. Changing to `"split"` or `"not_allowed"` would provide no benefit and would
require re-justification to CWS reviewers.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| GitHub Pages (privacy policy hosting) | TermsFeed / Termly generators | Generators produce boilerplate with inapplicable clauses (cookies, analytics, ads); adds third-party branding; less accurate for a no-telemetry extension |
| GitHub Pages | Google Sites | Works but no custom path; less professional for an open-source project |
| `navigator.storage.estimate()` (disk warning) | `chrome.system.storage` | Requires adding `"system.storage"` permission to manifest, triggering extended CWS re-review; `navigator.storage.estimate()` requires no new permission |
| Manual + Playwright screenshots | Hotpot.ai / screenshot generator services | Services add device-frame marketing chrome that may obscure actual UI; plain 1280x800 captures are more credible to reviewers |
| Crxcavator (pre-submission scan) | No tooling | Catches permission risks before submission; reduces rejection cycles |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `chrome.system.storage` for disk space | Adds a new permission to the manifest, triggering CWS re-review | `navigator.storage.estimate()` — no new permission |
| Privacy policy generator services (TermsFeed, Termly) | Generic boilerplate includes clauses for cookies/analytics/advertising that don't apply to this extension; may confuse reviewers | Hand-written policy on GitHub Pages |
| Notion / Google Docs / Pastebin for privacy policy URL | These URLs require logins or are mutable; CWS reviewers require a stable, public HTTPS static page | GitHub Pages static HTML |
| `raw.githubusercontent.com` in connect-src (if unused) | Reviewers may flag this as a potential remote-code fetch vector | Remove if not needed; grep to confirm before deciding |
| Adding `"tabs"`, `"history"`, or `"<all_urls>"` permissions | These permissions trigger extended manual review and are not needed for this extension's functionality | Keep the current minimal permission set |
| Uploading a ZIP with test/dev artifacts | CWS scans ZIP contents; `.map` files, local test HTML, or dev-only scripts increase review time | Build a clean production ZIP from `extension/` excluding dev files |

---

## Version Compatibility

| Component | Requirement | Notes |
|-----------|------------|-------|
| `navigator.storage.estimate()` | Chrome 52+ | Available in all current Chromium builds; no compatibility concern |
| Side panel API (`sidePanel` permission) | Chrome 114+ | Already in use; no change |
| WASM + `wasm-unsafe-eval` CSP | Chrome 95+ (MV3) | Already in manifest; no change |
| GitHub Pages | N/A (hosting, not runtime) | Stable permanent HTTPS; no version concern |

---

## Sources

- [Chrome Web Store — Publish your extension](https://developer.chrome.com/docs/webstore/publish) — publishing steps confirmed
- [Chrome Web Store — Supplying Images](https://developer.chrome.com/docs/webstore/images) — screenshot and promotional tile dimensions confirmed (HIGH confidence)
- [Chrome Web Store — Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) — dashboard field requirements confirmed (HIGH confidence)
- [Chrome Web Store — Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — permissions justification field requirements confirmed (HIGH confidence)
- [Chrome Web Store — Privacy Policies policy](https://developer.chrome.com/docs/webstore/program-policies/privacy) — privacy policy trigger conditions confirmed (HIGH confidence)
- [Chrome Web Store — MV3 additional requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) — remote code policy confirmed (HIGH confidence)
- [Chrome Web Store — Register your developer account](https://developer.chrome.com/docs/webstore/register) — account requirements confirmed (HIGH confidence)
- [Chrome Web Store — Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) — single purpose policy confirmed (HIGH confidence)
- [Chrome Web Store — Policy updates 2025](https://developer.chrome.com/blog/cws-policy-updates-2025) — 2025 policy changes reviewed; no AI-download or permission changes (HIGH confidence)
- [Chrome Extensions — Manifest: Incognito](https://developer.chrome.com/docs/extensions/reference/manifest/incognito) — spanning mode storage behavior confirmed (HIGH confidence)
- [chrome.system.storage API](https://developer.chrome.com/docs/extensions/reference/api/system/storage) — permission requirement confirmed (HIGH confidence)
- [StorageManager.estimate() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) — API availability and behavior confirmed (HIGH confidence)
- [CRXcavator documentation](https://crxcavator.io/docs) — automated permission scanning tool (MEDIUM confidence — third-party tool)
- [Extension Radar Blog — CWS developer fee 2026](https://www.extensionradar.com/blog/chrome-web-store-developer-fee-2026) — $5 fee confirmed (MEDIUM confidence — third-party, consistent with official sources)

---

*Stack research for: CWS Publication Readiness (v1.1 milestone)*
*Researched: 2026-02-19*
