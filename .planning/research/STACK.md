# Stack Research — Chat Signal Radar Improvements

**Date:** 2026-02-19
**Milestone:** Subsequent — targeted improvements to existing Chrome MV3 + Rust/WASM extension
**Scope:** DOMPurify integration, WASM message buffer sizing, options page configurable thresholds

---

## Research Areas

Three improvements are in scope. Each section covers: what to use, what version, the rationale, what not to use, and a confidence level.

---

## 1. DOMPurify Integration

### What to Use

**DOMPurify 3.3.1** — vendored as a standalone `purify.min.js` file placed at `extension/libs/dompurify/purify.min.js`.

- Current version: **3.3.1** ("Oriana"), published late 2024.
- Minified size: approximately **20 KB** (gzipped). Well within the project's stated ~60 KB budget.
- Source: download `dist/purify.min.js` directly from [github.com/cure53/DOMPurify](https://github.com/cure53/DOMPurify) releases. No npm or build step required — it is a self-contained IIFE/UMD bundle.

### Why This Approach

**CSP compatibility.** The existing manifest CSP is:

```
"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; ..."
```

MV3 extension pages cannot include `'unsafe-eval'` in `script-src`. DOMPurify resolved its historical eval dependency (the `Function(...)` pattern documented in issue #249 and issue #107) by DOMPurify 2.x. Version 3.x has no eval dependency and operates entirely through DOM APIs (`createElement`, `createTreeWalker`, attribute enumeration). It is safe to run inside extension pages with the project's existing strict CSP without any CSP change.

**No npm, no build step.** The project constraint is "no framework changes, vanilla JS." Vendoring the pre-built `purify.min.js` is identical to how WebLLM is handled (`extension/libs/web-llm/`). Load it with a `<script src="...">` tag in `sidebar.html` and `options.html`, or import it dynamically. Because DOMPurify is an IIFE/UMD, it attaches `DOMPurify` to the global scope when loaded as a script tag — no ES module wiring required.

**Why better than the current `safeSetHTML`.** The existing `safeSetHTML` in `DOMHelpers.js` uses a hardcoded allowlist of four regex patterns. It silently replaces any HTML that does not match with `'Content blocked for security'`. This creates false negatives (safe HTML blocked) and is not a sanitizer — it is a strict validator. `sidebar.js` has 18+ `innerHTML` assignments that bypass it entirely. DOMPurify strips dangerous elements and attributes from arbitrary HTML while preserving safe markup, which is the correct approach for display of chat-derived strings.

**Replacement surface.** The current `safeSetHTML` function has only four patterns. Replacing `safeSetHTML` with `DOMPurify.sanitize()` covers not just those four call sites but all the unprotected `innerHTML` assignments in `sidebar.js` that currently bypass validation entirely.

### Integration Pattern

```javascript
// In sidebar.html and options.html, before sidebar.js loads:
// <script src="../libs/dompurify/purify.min.js"></script>

// Replace all unguarded innerHTML assignments:
element.innerHTML = DOMPurify.sanitize(untrustedString);

// For the specific case of plain text (no HTML needed):
// Prefer textContent — DOMPurify is for cases where limited markup is acceptable
element.textContent = untrustedString;

// Sanitize with an explicit allowlist when only basic formatting is needed:
element.innerHTML = DOMPurify.sanitize(untrustedString, {
  ALLOWED_TAGS: ['ul', 'li', 'span', 'div', 'p'],
  ALLOWED_ATTR: ['class']
});
```

**DOMHelpers.js change:** Remove the regex-based `safeSetHTML` body. Replace with `DOMPurify.sanitize()`. Keep the function signature so call sites do not need to be updated immediately.

### What NOT to Use

- **Sanitizer API (Web Sanitizer API / `setHTML()`):** Still experimental as of February 2026. Available only in Firefox Nightly and Chrome Canary behind flags — not in stable Chrome. Do not use for a production extension.
- **Trusted Types API:** Supported in Chrome 83+, but requires significant scaffolding (policy objects, wrapper functions). Not justified for this project scope when DOMPurify is simpler and directly handles the XSS class.
- **isomorphic-dompurify or dompurify wrappers:** Not needed. The browser-native DOMPurify (not the Node.js variant) is correct for extension pages, which always have a DOM.
- **CDN-loaded DOMPurify:** Chrome extension CSP blocks external script sources (`connect-src` is separate from `script-src`). The library must be bundled inside the extension.

### Confidence: HIGH

DOMPurify 3.3.1 is a well-established library actively maintained by security researchers (cure53). The no-eval constraint has been resolved for years. The file-size constraint (20 KB minified) is far below the project's 60 KB budget. The vendoring pattern matches the project's existing approach for WebLLM.

---

## 2. WASM Message Buffer Size

### What to Use

Increase `MAX_MESSAGES` from 100 to **500** as the primary rolling window, with a configurable upper bound exposed in the options page (see Section 3).

### Why 500 Is the Right Target

**Current analysis quality is severely limited at 100 messages.** At the project's default 5-second batch interval (`BATCH_INTERVAL = 5000` in `content-script.js`), a busy Twitch stream can deliver 50–200 messages per 5-second window. A 100-message cap means the oldest messages in that window are immediately evicted. Topic detection requires a minimum of 5 mentions (`topicMinCount` default) — with only 100 messages, terms must appear in 5% of all messages to surface, which is a very high bar in diverse chats.

**500 messages represents roughly 25–50 seconds of high-volume chat.** At 10–20 messages per second (a mid-tier Twitch stream), 500 messages is a 25–50 second window. This window is long enough for genuine trending topics to emerge and for sentiment to reflect the chat's actual emotional state rather than a noisy recent sample.

**WASM serialization cost does not prohibit 500 messages.** The JS-to-WASM boundary crossing (via `serde-wasm-bindgen`) serializes the entire message array on each call. Key data points:

- Each message object is approximately 100–300 bytes of JSON (text up to 1000 chars, author up to 50 chars, timestamp).
- A 500-message array is at most ~150 KB of data.
- `serde-wasm-bindgen` 0.6 (already in use) directly manipulates JavaScript values without an intermediate JSON stringify/parse step. Serialization of 500 small objects is in the low single-digit milliseconds range in Chrome.
- The WASM analysis itself (clustering, topic extraction, sentiment counting) is O(n) in message count and extremely fast in native-speed WASM code.
- The analysis runs every 5 seconds, not on every message. A single 500-message analysis every 5 seconds adds negligible CPU overhead.

**Memory impact is bounded and acceptable.** 500 messages × 300 bytes average = ~150 KB in the JS heap for the `allMessages` array. This is immaterial for a browser extension running in a side panel.

**Do not go above 1000 without incremental analysis.** At very high message volumes (1000+ msg/min, rare major Twitch events), re-analyzing the entire 1000-message window every 5 seconds starts to consume meaningful CPU time and the WASM call overhead increases. The CONCERNS.md notes an incremental delta approach as the correct fix for hyper-active chats — but that is architectural work outside this milestone's scope. 500 is the practical limit for a full-window re-analysis approach.

### Recommended Configuration

```javascript
// extension/sidebar/sidebar.js — current:
const MAX_MESSAGES = 100;

// Change to:
const MAX_MESSAGES = 500; // Default; overridable via settings
```

Expose this as a settings key `analysisWindowSize` with:
- Min: 50
- Max: 1000
- Default: 500
- Step: 50

The WASM functions `analyze_chat` and `analyze_chat_with_settings` already accept a `Vec<Message>` of arbitrary length — no Rust changes are required to support 500 messages.

### What NOT to Do

- **Do not increase to 1000 as the fixed default.** The current architecture does full re-analysis on every batch. 1000-message batches are safe at 5-second intervals for most streams, but create unnecessary memory pressure and slightly higher CPU cost for no analytical benefit (topic quality improves marginally above ~500 messages with the current keyword-based approach).
- **Do not implement a circular ring buffer in Rust.** The JS-side `allMessages.slice(-MAX_MESSAGES)` pattern is simple and correct. Moving the buffer into WASM would require a stateful WASM module (global mutable state), which complicates testing and makes the WASM harder to reason about. Keep WASM purely functional (stateless analysis of an input array).
- **Do not use SharedArrayBuffer.** This requires `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers, which are not applicable to extension sidebar pages. Standard JSON serialization through serde-wasm-bindgen is the correct approach.

### Confidence: HIGH

The 500-message recommendation is grounded in:
1. The existing code already works correctly for arbitrary input sizes.
2. The JS-to-WASM serialization cost scales linearly and benignly for this data size.
3. The project's CONCERNS.md explicitly calls out 500 messages as a target for the sliding window (section "Scaling Limits").
4. No Rust changes are needed — only a constant change in `sidebar.js`.

---

## 3. Options Page — Configurable Thresholds

### What to Use

Extend the existing `extension/options/` page (plain HTML + vanilla JS + `chrome.storage.sync`) with four additional settings:

| Setting Key | UI Label | Type | Min | Max | Default | Step |
|---|---|---|---|---|---|---|
| `analysisWindowSize` | Analysis window size (messages) | range slider | 50 | 1000 | 500 | 50 |
| `inactivityTimeout` | Stream inactivity timeout (seconds) | range slider | 30 | 600 | 120 | 30 |
| `sentimentSensitivity` | Sentiment sensitivity (min signals) | range slider | 1 | 10 | 3 | 1 |
| `topicMinCount` | Topic min mentions | range slider | 1 | 20 | 5 | 1 |

Note: `sentimentSensitivity` and `topicMinCount` already exist in the options page. Confirm their existing ranges and defaults remain consistent with defaults in `sidebar.js`. Only `analysisWindowSize` and `inactivityTimeout` are genuinely new.

### Why the Existing Pattern Is Correct

**`chrome.storage.sync` is the right store for these settings.** These are user preferences (not session data, not large blobs). The entire settings object for this extension is under 200 bytes — far below the 8 KB per-item and 100 KB total quotas. Sync storage means settings roam across the user's Chrome-signed-in devices automatically, which is the desirable behavior for user preferences.

**Do not switch to `chrome.storage.local` for settings.** `local` is appropriate for the session history data (large, device-specific). Settings should remain in `sync` per the existing pattern and Chrome's official guidance.

**The existing pattern for real-time propagation works correctly.** `sidebar.js` already listens to `chrome.storage.onChanged` (line 196–203) and applies new settings immediately. New settings added to the same `settings` object key will be picked up automatically without any architectural change.

### Implementation Pattern

The existing pattern in `options.js` is idiomatic and correct:

```javascript
// options.js — add new inputs following existing pattern:
const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  sentimentSensitivity: 3,
  moodUpgradeThreshold: 30,
  aiSummariesEnabled: false,
  analysisWindowSize: 500,   // NEW
  inactivityTimeout: 120     // NEW (seconds)
};
```

The corresponding `DEFAULT_SETTINGS` block in `sidebar.js` must be kept in sync — this is the most fragile part of the existing architecture (duplication, no single source of truth). Consider adding a comment marking this as "must match options.js".

### Validation

Add to `ValidationHelpers.js`:

```javascript
// Already present for topicMinCount, spamThreshold, duplicateWindow — add:
if (typeof settings.analysisWindowSize !== 'number' ||
    settings.analysisWindowSize < 50 || settings.analysisWindowSize > 1000) {
  throw new Error('analysisWindowSize must be between 50 and 1000');
}

if (typeof settings.inactivityTimeout !== 'number' ||
    settings.inactivityTimeout < 30 || settings.inactivityTimeout > 600) {
  throw new Error('inactivityTimeout must be between 30 and 600 seconds');
}
```

### Options Page UX Guidance

The existing pattern (range slider + numeric display span) is appropriate for all new settings. Two notes:

1. **Pair sliders with a live value display.** The existing `<span class="value-display">` pattern already does this. For `analysisWindowSize`, display as "500 messages"; for `inactivityTimeout`, display as "120s".
2. **Group new settings logically.** Place `analysisWindowSize` in a new "Analysis" section. Place `inactivityTimeout` in a new "Session" section (or expand "Spam Detection" to a broader "Processing" section).

### Applying Settings at Runtime

`inactivityTimeout` currently hardcodes `INACTIVITY_TIMEOUT = 120000` ms in `sidebar.js`. Change it to read from settings:

```javascript
// sidebar.js — derive from settings (already loaded):
const inactivityMs = (settings.inactivityTimeout ?? 120) * 1000;
```

`analysisWindowSize` controls `MAX_MESSAGES`:

```javascript
const MAX_MESSAGES = settings.analysisWindowSize ?? 500;
```

Both values are read once at startup and updated when `chrome.storage.onChanged` fires — the existing listener at lines 196–203 handles this automatically for the `settings` object.

### What NOT to Do

- **Do not add a separate options page file.** The existing `extension/options/options.html` + `options.js` is sufficient. Adding a second page increases surface area without benefit.
- **Do not use `open_in_tab: true`** for the options page. The current manifest uses `"open_in_tab": false` (embedded panel). This is the correct UX for settings that users adjust rarely — no need to change it.
- **Do not use `IndexedDB` for settings.** It is not accessible from extension service workers without additional wrappers, and is inappropriate for small, frequently-read preference data.
- **Do not expose `moodUpgradeThreshold` for the first time in this milestone** unless already planned — it is already in the options page, so no action needed.

### Confidence: HIGH

The existing options page pattern is idiomatic Chrome MV3. `chrome.storage.sync` is explicitly recommended by Chrome documentation for user preferences. The real-time propagation mechanism (`onChanged` listener) is already wired in `sidebar.js`. No new architecture is needed — only adding fields to existing data structures.

---

## Summary Table

| Topic | Recommendation | Version / Value | Confidence |
|---|---|---|---|
| DOM Sanitization library | DOMPurify, vendored as `purify.min.js` | 3.3.1 (~20 KB min) | HIGH |
| DOMPurify loading method | `<script>` tag in sidebar.html / options.html | n/a (IIFE/UMD, no import) | HIGH |
| CSP impact | None — no manifest.json changes required | `'unsafe-eval'` not needed | HIGH |
| Sanitizer API (`setHTML`) | Do NOT use — experimental only in Canary/Nightly | n/a | HIGH |
| WASM buffer size (default) | Increase `MAX_MESSAGES` to 500 | 500 (from 100) | HIGH |
| WASM buffer max (configurable) | Up to 1000 via options page | 1000 upper bound | MEDIUM |
| Buffer location | JS-side `allMessages.slice()` — keep as-is | n/a | HIGH |
| SharedArrayBuffer | Do NOT use — requires COOP/COEP headers | n/a | HIGH |
| New settings store | `chrome.storage.sync` — existing pattern | n/a | HIGH |
| New settings: window size | `analysisWindowSize`, range 50–1000, default 500 | chrome.storage.sync | HIGH |
| New settings: inactivity | `inactivityTimeout`, range 30–600s, default 120s | chrome.storage.sync | HIGH |
| Options page architecture | Extend existing `options.js` / `options.html` | n/a | HIGH |
| Options page display style | `open_in_tab: false` — keep existing | n/a | HIGH |

---

## Sources Consulted

- [DOMPurify GitHub repository (cure53/DOMPurify)](https://github.com/cure53/DOMPurify)
- [DOMPurify npm package](https://www.npmjs.com/package/dompurify)
- [DOMPurify Issue #249 — unsafe-eval CSP](https://github.com/cure53/DOMPurify/issues/249)
- [DOMPurify Issue #107 — Chrome unsafe-eval complaint](https://github.com/cure53/DOMPurify/issues/107)
- [Chrome Extensions — Content Security Policy (MV3)](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Chrome Extensions — Improve Extension Security (MV3)](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
- [wasm-bindgen — Arbitrary Data with Serde](https://rustwasm.github.io/docs/wasm-bindgen/reference/arbitrary-data-with-serde.html)
- [serde-wasm-bindgen docs.rs](https://docs.rs/serde-wasm-bindgen/latest/serde_wasm_bindgen/)
- [chrome.storage API reference](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [HTML Sanitizer API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API)
- [Sanitizer API — Can I Use](https://caniuse.com/mdn-api_sanitizer)
- [wasm-bindgen performance discussion — HN](https://news.ycombinator.com/item?id=45664341)
- [WebAssembly Performance — OpenReplay blog](https://blog.openreplay.com/running-high-performance-code-wasm/)
- [chrome.storage.sync best practices — Chromium Extensions group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ACVyerzOjus)

---

*Research completed: 2026-02-19*
