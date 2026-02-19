# Phase 2: DOMPurify Integration - Research

**Researched:** 2026-02-19
**Domain:** Client-side HTML sanitization — DOMPurify vendoring and migration in a Chrome MV3 extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Sanitization Strictness
- Use DOMPurify defaults — no custom allowlist. Defaults already strip scripts, event handlers, and dangerous patterns
- Sanitize everything — every innerHTML assignment goes through DOMPurify, including trusted JS templates. Defense in depth, no exceptions
- String mode (default) — DOMPurify.sanitize() returns a clean string, not a DocumentFragment. Keeps innerHTML pattern for simpler migration
- Centralized config — define a shared DOMPurify config object in DOMHelpers.js. Even if it starts as defaults, it's one place to tighten later

#### Helper API After Migration
- Keep `safeSetHTML` name — same function signature, new DOMPurify internals. Zero call-site changes where already used
- safeSetHTML is the only exported helper — no separate sanitizeHTML string wrapper. One function, one pattern
- Inline `DOMPurify.sanitize()` is acceptable at call sites where safeSetHTML doesn't naturally fit (e.g., building composite HTML)
- Add comment convention — `// All innerHTML must use DOMPurify` at the top of sidebar files as a reminder for future contributors

#### Edge Case Handling
- Test emote rendering carefully — emote names are plain text in `<span>` tags but some may contain special characters worth verifying
- If DOMPurify strips something that causes visible breakage, fix the HTML source — don't allowlist attributes. DOMPurify config stays default
- Treat WASM output as untrusted — analysis results pass through DOMPurify like all other content. Defense in depth
- Trust document order for script loading — place DOMPurify script tag before the ES module in sidebar.html, no runtime guard check needed

### Claude's Discretion
- Exact placement of DOMPurify script tag in sidebar.html relative to other scripts
- How to structure the centralized config constant
- Which innerHTML sites are already using safeSetHTML vs raw innerHTML (codebase audit)
- Order of migration (which files/functions to migrate first)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAN-01 | Vendor DOMPurify 3.3.1 as `extension/libs/dompurify/purify.min.js` and load via script tag in sidebar.html before ES module | Verified: v3.3.1 is current; `purify.min.js` is the correct UMD browser build; must appear before `<script type="module">` in sidebar.html |
| SAN-02 | Migrate all innerHTML assignments in sidebar to use DOMPurify.sanitize() via updated DOMHelpers | Audited: 31 innerHTML sites in sidebar.js + 3 in DOMHelpers.js; categorized into clear-ops, static strings, and dynamic HTML that needs sanitization |
| SAN-03 | Remove old regex-based safeSetHTML implementation after migration | Two copies exist: one in DOMHelpers.js (exported), one inline in sidebar.js (private) — both must be replaced |
</phase_requirements>

## Summary

DOMPurify 3.3.1 is the confirmed current version (as of the research date). It is a UMD library that exposes a `window.DOMPurify` global when loaded via a plain `<script>` tag, making it fully compatible with the Manifest V3 Chrome extension pattern of vendoring third-party code as a local file. The `purify.min.js` build (~50-55 KB) is the correct file to vendor at `extension/libs/dompurify/purify.min.js`.

The existing codebase has a thorough `innerHTML` audit completed during this research. `sidebar.js` contains 31 `innerHTML` assignments, and `DOMHelpers.js` contains 3. They fall into three categories: (1) clear-to-empty operations (`= ''`) that need no sanitization, (2) static string literals with no dynamic data that can be sanitized for consistency, and (3) dynamic template literals embedding WASM output or user-facing data that are the primary XSS risk. DOMPurify defaults allow `class`, `id`, `style`, and `href` attributes, which means the inline `style="width: ${percent}%"` CSS in sentiment bars will pass through unchanged.

The migration strategy is: vendor the library, add the `<script>` tag to sidebar.html before the ES module, replace `safeSetHTML` internals in DOMHelpers.js, add the centralized config constant, then sweep through all dynamic innerHTML calls in sidebar.js replacing them with `DOMPurify.sanitize()`. The old regex-based implementations (in both DOMHelpers.js and sidebar.js) are removed last as a clean-up step.

**Primary recommendation:** Download `purify.min.js` from the 3.3.1 tag on GitHub, place at `extension/libs/dompurify/purify.min.js`, add one `<script>` tag in sidebar.html, update DOMHelpers.js, then migrate inline innerHTML calls in sidebar.js.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DOMPurify | 3.3.1 | XSS-safe HTML sanitization | Industry-standard DOM-only sanitizer; actively maintained; browser-native implementation avoids regex pitfalls |

### How DOMPurify is Loaded in This Context

DOMPurify uses a UMD module format in `purify.min.js`. When loaded via a plain `<script>` tag (not `type="module"`), it attaches to `window.DOMPurify`. Because `sidebar.js` is an ES module, it cannot `import` DOMPurify directly from a UMD file without a bundler. The correct approach is the script tag first, then the ES module — the ES module can access `window.DOMPurify` (or just `DOMPurify`) as a global.

**Source file to download:**
```
https://github.com/cure53/DOMPurify/releases/download/3.3.1/purify.min.js
```
Or from unpkg:
```
https://unpkg.com/dompurify@3.3.1/dist/purify.min.js
```

**sidebar.html script loading (order matters):**
```html
<!-- DOMPurify must come before the ES module -->
<script src="../libs/dompurify/purify.min.js"></script>
<script type="module" src="sidebar.js"></script>
```

Note: sidebar.html currently has only `<script type="module" src="sidebar.js"></script>` at line 170. The DOMPurify script tag must be inserted immediately before it.

The path `../libs/dompurify/purify.min.js` assumes sidebar.html lives at `extension/sidebar/sidebar.html` and the library is at `extension/libs/dompurify/purify.min.js`.

## Architecture Patterns

### Recommended File Structure After Migration

```
extension/
├── libs/
│   └── dompurify/
│       └── purify.min.js       # Vendored DOMPurify 3.3.1
├── sidebar/
│   ├── sidebar.html            # Add <script> tag for DOMPurify
│   ├── sidebar.js              # Migrate all raw innerHTML to DOMPurify
│   └── utils/
│       └── DOMHelpers.js       # Replace safeSetHTML internals; add config constant
```

### Pattern 1: Centralized Config in DOMHelpers.js

**What:** Define one config object at the top of DOMHelpers.js. All sanitization in the codebase references it.
**When to use:** Always — even though it starts as empty defaults, it becomes the single place to tighten config later.

```javascript
// Source: CONTEXT.md decision + DOMPurify README
// All innerHTML must use DOMPurify

// Shared DOMPurify configuration — one place to tighten later
const DOMPURIFY_CONFIG = {};

// Safe HTML setter — replaces regex-based implementation
export function safeSetHTML(element, htmlContent) {
  element.innerHTML = DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG);
}
```

### Pattern 2: Inline DOMPurify at Complex Sites

**What:** At innerHTML call sites that build composite HTML via `.map().join('')` or template literals, call `DOMPurify.sanitize()` directly around the assembled string.
**When to use:** When the HTML string is built inline rather than passed to `safeSetHTML`.

```javascript
// Source: CONTEXT.md — "Inline DOMPurify.sanitize() is acceptable at call sites
// where safeSetHTML doesn't naturally fit"
element.innerHTML = DOMPurify.sanitize(`
  <div class="sentiment-bar">
    <span class="sentiment-bar-label">${type}</span>
    <div class="sentiment-bar-track">
      <div class="sentiment-bar-fill ${type}" style="width: ${percent}%"></div>
    </div>
    <span class="sentiment-bar-value">${count}</span>
  </div>
`, DOMPURIFY_CONFIG);
```

Note: `DOMPURIFY_CONFIG` from DOMHelpers.js must be exported and imported, or duplicated as a local constant — see Pattern 3.

### Pattern 3: Exporting the Config Constant

Since `sidebar.js` needs `DOMPURIFY_CONFIG` for inline call sites, export it from DOMHelpers.js:

```javascript
// DOMHelpers.js
export const DOMPURIFY_CONFIG = {};

export function safeSetHTML(element, htmlContent) {
  element.innerHTML = DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG);
}
```

```javascript
// sidebar.js (or any file needing inline sanitization)
import { safeSetHTML, DOMPURIFY_CONFIG } from './utils/DOMHelpers.js';

// Then inline sites use:
element.innerHTML = DOMPurify.sanitize(htmlString, DOMPURIFY_CONFIG);
```

### Anti-Patterns to Avoid

- **Runtime DOMPurify availability check:** The decision is to trust document order — no `if (typeof DOMPurify !== 'undefined')` guard needed.
- **Using `innerHTML = ''` through DOMPurify:** Clear-to-empty calls (`element.innerHTML = ''`) do NOT need sanitization. Sanitizing an empty string is harmless but adds noise. Leave them as-is.
- **Re-implementing regex fallback:** The old `safeSetHTML` regex patterns are not a fallback — they are replaced entirely. Do not keep them as a "fallback" path.
- **Separate `sanitizeHTML` string function:** Only `safeSetHTML` is exported. No separate string-returning wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML sanitization | Regex whitelist (current approach) | DOMPurify.sanitize() | Regex patterns miss mutation XSS, attribute injection, encoding bypasses; DOMPurify uses browser's own parser |
| Attribute filtering | Custom attribute scanner | DOMPurify defaults | 200+ event handler attributes to block; DOMPurify's list is tested against known bypass vectors |
| Script tag detection | Pattern matching on `<script>` | DOMPurify defaults | `<scr\nipt>`, encoded variants, SVG/MathML vectors all evaded historically |

**Key insight:** The current regex whitelist in `safeSetHTML` only allows four exact patterns. This means it blocks everything _except_ known strings — which is actually very restrictive. DOMPurify's approach is the inverse: allow known-safe HTML structure, block known-dangerous constructs. DOMPurify's approach handles the full variety of dynamic content the sidebar actually generates.

## Complete innerHTML Audit

This audit is the primary deliverable for planning purposes.

### Category A: Clear-to-Empty (No sanitization needed — leave as-is)

These set `innerHTML = ''` to wipe a container before re-rendering. No user data involved.

| Line | Location | Code |
|------|----------|------|
| 367 | processMessages() | `clustersDiv.innerHTML = ''` |
| 397 | processMessages() | `bucketEl.innerHTML = ''` |
| 424 | updateTopics() | `topicsCloud.innerHTML = ''` |
| 540 | generateAISummary() | `aiSummaryText.innerHTML = ''` |
| 555 | generateAISummary() | `aiSummaryText.innerHTML = ''` |
| 804 | showSessionSummary() | `topicsContainer.innerHTML = ''` |
| 817 | showSessionSummary() | `clustersContainer.innerHTML = ''` |
| 835 | showSessionSummary() | `questionsContainer.innerHTML = ''` |
| 977 | startNewSession() | `clustersDiv.innerHTML = ''` |
| 1103 | renderHistoryList() | `historyList.innerHTML = ''` |

Also in DOMHelpers.js:
- Line 61: `container.innerHTML = ''` inside `batchDOMUpdates()`

### Category B: Static Strings (Can use safeSetHTML for consistency, DOMPurify will pass them unchanged)

These are hardcoded HTML with no dynamic data. They currently bypass the old `safeSetHTML` regex (either they already matched, or they're inline assignments not using the helper). With DOMPurify, wrap via `safeSetHTML()` or `DOMPurify.sanitize()`.

| Line | Location | String |
|------|----------|--------|
| 798 | showSessionSummary() | `'<p class="summary-no-data">No sentiment data</p>'` |
| 854 | showSessionSummary() | `'<p class="summary-no-data">No clusters</p>'` |
| 866 | showSessionSummary() | `'<p class="summary-no-data">No questions captured</p>'` |
| 1187 | viewSessionDetail() | `'<p class="summary-no-data">No sentiment data</p>'` |
| 1197 | viewSessionDetail() | `'<p class="summary-no-data">No trending topics</p>'` |
| 1210 | viewSessionDetail() | `'<p class="summary-no-data">No clusters</p>'` |
| 1229 | viewSessionDetail() | `'<p class="summary-no-data">No questions captured</p>'` |

Also in DOMHelpers.js (via the exported `safeSetHTML`):
- Line 33: `element.innerHTML = htmlContent` — this becomes `element.innerHTML = DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG)`

### Category C: Dynamic HTML — Primary Migration Targets

These embed WASM output, user-facing data, or calculated values. These are the XSS risk and must go through DOMPurify.

| Line | Function | Dynamic Data Source | Notes |
|------|----------|---------------------|-------|
| 448 | `updateTopics()` | `topic.term` (WASM), `topic.count` (WASM) | Template literal on `tag.innerHTML`; already calls `escapeHtml(topic.term)` but raw `topic.count` is used |
| 528 | `updateSentimentSamples()` | `label` (internal), `signals.*_samples[]` (WASM) | Multi-line template; `label` is hardcoded string, samples are WASM strings |
| 784 | `showSessionSummary()` | `type` (loop var), `count`/`percent` (calculated), `sessionSentiment` (accumulated) | Inline `sentimentContainer.innerHTML =` with `.map().join('')` |
| 847 | `showSessionSummary()` | `bucket.label` (WASM), `bucket.count` (WASM) | Second duplicate cluster rendering block (potential dead code) |
| 862 | `showSessionSummary()` | `sessionQuestions[]` (WASM via accumulator) | Uses `escapeHtml()` already but innerHTML is still raw |
| 1127 | `renderHistoryList()` | `dateStr` (formatted Date), `session.platform` (storage), `session.duration`, `session.messageCount`, `session.mood` | Large template; uses `escapeHtml()` for dateStr and platform |
| 1173 | `viewSessionDetail()` | `type` (loop var), `signals.*_count` (storage), `percent` (calculated) | Inline `.map().join('')` |
| 1193 | `viewSessionDetail()` | `session.topics[]` (storage) | Uses `escapeHtml(topic.term)`, raw `topic.count` |
| 1203 | `viewSessionDetail()` | `session.buckets[]` (storage) | Uses `escapeHtml(bucket.label)`, raw `bucket.count` |
| 1218 | `viewSessionDetail()` | `session.sessionQuestions[]` (storage) | Uses `escapeHtml(msg)` |
| 1225 | `viewSessionDetail()` | `session.buckets[].sample_messages[]` (storage) | Uses `escapeHtml(msg)` |

**Note on `sidebar.js` private `safeSetHTML`:** Lines 582–597 contain a private copy of the regex-based `safeSetHTML` not imported from DOMHelpers.js. This is used at lines 370, 811, 827, 841 (via `safeSetHTML()` calls without module prefix). This private copy must be removed and replaced with the DOMPurify-backed version from DOMHelpers.js — meaning `safeSetHTML` must be imported from DOMHelpers.js in sidebar.js.

**Note on `sidebar.js` private `safeCreateElement` and `escapeHtml`:** Lines 568–580 also contain private copies of `safeCreateElement` and `escapeHtml` that duplicate what's in DOMHelpers.js. These are separate from the sanitization migration but should be noted — the plan should focus on replacing `safeSetHTML` and direct `innerHTML` assignments; do not scope-creep into unifying the duplicate helpers unless required.

## Common Pitfalls

### Pitfall 1: DOMPurify Not Available at Module Load Time

**What goes wrong:** `sidebar.js` is a `type="module"` script. If the DOMPurify `<script>` tag is placed after the module script, or if the module executes code at the top level before DOMPurify loads, `DOMPurify` will be undefined.
**Why it happens:** Module scripts are deferred by default — they execute after the document is parsed. But a plain `<script>` without `defer` or `async` executes synchronously during parse. If DOMPurify's `<script>` appears before the module script tag in document order, DOMPurify loads first.
**How to avoid:** Place `<script src="../libs/dompurify/purify.min.js"></script>` immediately before `<script type="module" src="sidebar.js"></script>` in sidebar.html. The decision is to trust document order (no runtime guard check).
**Warning signs:** `ReferenceError: DOMPurify is not defined` in the browser console when sidebar.html loads.

### Pitfall 2: `style` Attribute Preservation

**What goes wrong:** The sentiment bars use `style="width: ${percent}%"` in template literals. If a developer assumes DOMPurify strips inline `style` attributes, they might add a workaround that breaks the bar rendering.
**Why it happens:** Some older versions of DOMPurify had stricter CSS handling. Current defaults (3.x) allow `style` attributes.
**How to avoid:** No special config needed. `style` is in DOMPurify's default `ALLOWED_ATTR` list (verified against 3.3.1 source). The bars will render correctly.
**Warning signs:** Sentiment bars appear with 0 width — all bars flat — after migration.

### Pitfall 3: Class Attribute Stripped

**What goes wrong:** Dynamic class names like `${type}` inside `class="${type}"` (e.g., `sentiment-bar-fill positive`) get stripped.
**Why it happens:** Incorrect assumption that DOMPurify removes `class` attributes by default.
**How to avoid:** `class` is in DOMPurify's default allowed list. No special config needed.
**Warning signs:** CSS styling disappears on dynamically-generated elements (sentiment bars, topic tags, session cards).

### Pitfall 4: Two Copies of `safeSetHTML` in sidebar.js

**What goes wrong:** `sidebar.js` has its own private `safeSetHTML` at lines 582–597, and also a `safeSetHTML` import available from `DOMHelpers.js`. After migrating DOMHelpers.js, the private copy in sidebar.js still uses the old regex implementation.
**Why it happens:** The module was authored with inline helpers before DOMHelpers.js was fully adopted.
**How to avoid:** Explicitly import `safeSetHTML` from DOMHelpers.js at the top of sidebar.js, and delete the private copy. Grep for `function safeSetHTML` in sidebar.js as part of cleanup.
**Warning signs:** Tests or manual checks show that certain "no data" messages (`safeSetHTML` call sites at lines 370, 811, 827, 841) are still using the old regex path after migration.

### Pitfall 5: `escapeHtml` Redundancy with DOMPurify

**What goes wrong:** After migrating to DOMPurify, some innerHTML sites still call `escapeHtml()` before inserting into a template literal, then the whole string goes through DOMPurify. This is redundant — `escapeHtml()` converts `<` to `&lt;` etc., but DOMPurify would have handled that anyway.
**Why it happens:** The existing calls to `escapeHtml()` were the pre-DOMPurify safety layer.
**How to avoid:** This is not a bug — double-escaping is safe. The CONTEXT.md decision is "sanitize everything, defense in depth." Leave `escapeHtml()` calls in place; DOMPurify will treat the already-escaped text as plain text. Do not remove `escapeHtml()` calls as part of this phase.
**Warning signs:** Escaped HTML entities appearing visually (e.g., `&lt;` showing as literal text in the UI) would indicate double-escaping is causing display issues — but this should not happen because `escapeHtml()` output is plain text, not tags.

### Pitfall 6: The `FORCE_BODY` Option and Wrapped Content

**What goes wrong:** DOMPurify can silently drop structural tags. For the content in this codebase (simple `<div>`, `<span>`, `<p>`, `<ul>`, `<li>` fragments), this is not a concern.
**Why it happens:** DOMPurify parses input as an HTML fragment. It removes `<html>`, `<head>`, `<body>` wrapper tags. For document-level HTML this matters; for fragment HTML used in innerHTML assignments it does not.
**How to avoid:** The codebase only sanitizes HTML fragments (no full documents), so default behavior is correct. No `FORCE_BODY` or `WHOLE_DOCUMENT` options needed.
**Warning signs:** Not applicable for this codebase.

### Pitfall 7: Manifest V3 CSP Compatibility

**What goes wrong:** The current `manifest.json` CSP is `script-src 'self' 'wasm-unsafe-eval'`. Loading a script from CDN would violate this.
**Why it happens:** Manifest V3 bans remote code execution and restricts `script-src` to `'self'` by default.
**How to avoid:** DOMPurify is vendored locally at `extension/libs/dompurify/purify.min.js`. A local file loaded via relative path is covered by `'self'`. No changes to manifest.json CSP needed.
**Warning signs:** Chrome DevTools shows CSP violation error when sidebar.html loads.

## Code Examples

Verified patterns from official sources:

### Updated DOMHelpers.js — safeSetHTML

```javascript
// Source: DOMPurify README (https://github.com/cure53/DOMPurify) + CONTEXT.md

// All innerHTML must use DOMPurify

// Centralized DOMPurify configuration — one place to tighten later
// DOMPurify is loaded as a global via <script> tag in sidebar.html
export const DOMPURIFY_CONFIG = {};

// Safe HTML setter — replaces regex-based implementation
// Signature unchanged: same name, same args, zero call-site changes
export function safeSetHTML(element, htmlContent) {
  element.innerHTML = DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG);
}
```

### sidebar.html — Script Loading Order

```html
<!-- DOMPurify must load before the ES module -->
<script src="../libs/dompurify/purify.min.js"></script>
<script type="module" src="sidebar.js"></script>
```

### sidebar.js — Import safeSetHTML from DOMHelpers

```javascript
// Add to existing imports at top of sidebar.js
import { safeSetHTML, DOMPURIFY_CONFIG, escapeHtml, safeCreateElement, /* other utils */ } from './utils/DOMHelpers.js';
```

### Inline sanitization for complex templates (example from renderHistoryList)

```javascript
// Source: DOMPurify README string mode — returns sanitized HTML string
// DOMPURIFY_CONFIG imported from DOMHelpers.js

card.innerHTML = DOMPurify.sanitize(`
  <div class="session-card-header">
    <span class="session-card-date">${escapeHtml(dateStr)}</span>
    <span class="session-card-platform">${escapeHtml(session.platform)}</span>
  </div>
  <div class="session-card-stats">
    <span class="session-card-stat">
      <span>${formatDuration(session.duration)}</span>
    </span>
    <span class="session-card-stat">
      <span>${session.messageCount} msgs</span>
    </span>
  </div>
  <div class="session-card-mood">
    ${MOOD_EMOJIS[session.mood] || '😐'} ${escapeHtml(session.mood)}
  </div>
  <button class="session-card-delete" title="Delete session">
    <span>x</span>
  </button>
`, DOMPURIFY_CONFIG);
```

### Inline sanitization for sentiment bars (example of `style=` attribute surviving)

```javascript
// style="width: ${percent}%" is preserved — style is in DOMPurify's default ALLOWED_ATTR
// Source: verified against DOMPurify 3.3.1 source (unpkg.com/dompurify@3.3.1/dist/purify.es.mjs)

sentimentContainer.innerHTML = DOMPurify.sanitize(
  ['positive', 'negative', 'confused', 'neutral'].map(type => {
    const count = sessionSentiment[`${type}_count`];
    const percent = Math.round((count / total) * 100);
    return `
      <div class="sentiment-bar">
        <span class="sentiment-bar-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
        <div class="sentiment-bar-track">
          <div class="sentiment-bar-fill ${type}" style="width: ${percent}%"></div>
        </div>
        <span class="sentiment-bar-value">${count}</span>
      </div>
    `;
  }).join(''),
  DOMPURIFY_CONFIG
);
```

### tag.innerHTML for topic cloud (example)

```javascript
// updateTopics() — tag is a <span> element
tag.innerHTML = DOMPurify.sanitize(`
  ${escapeHtml(topic.term)}
  <span class="topic-count">${topic.count}</span>
`, DOMPURIFY_CONFIG);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex whitelist matching exact HTML patterns | DOMPurify.sanitize() with browser DOM parser | This phase | Eliminates XSS class; supports dynamic HTML; removes maintenance burden of maintaining pattern list |
| 4-pattern regex in `safeSetHTML` | DOMPurify with default config | This phase | Old approach blocked all dynamic HTML; new approach sanitizes it safely |

**Deprecated/outdated:**
- `safeSetHTML` regex implementation: Replaced by DOMPurify. The existing implementation is so restrictive it blocks all dynamic content, which is why the codebase has widespread raw `innerHTML` assignments bypassing the helper.

## Open Questions

1. **Module-to-global DOMPurify access from sidebar.js**
   - What we know: DOMPurify attaches to `window.DOMPurify` when loaded as a UMD script. ES modules have access to `window` globals.
   - What's unclear: Whether `DOMPurify` (without `window.`) resolves correctly in strict ES module scope in a Chrome extension context. Both `DOMPurify` and `window.DOMPurify` should work identically in browser context.
   - Recommendation: Use bare `DOMPurify` (not `window.DOMPurify`) for cleaner code. If a `ReferenceError` occurs during testing, switch to `window.DOMPurify`.

2. **DOMPURIFY_CONFIG export approach**
   - What we know: Inline call sites in sidebar.js need access to the config object to maintain the single source of truth.
   - What's unclear: Whether it's cleaner to export `DOMPURIFY_CONFIG` from DOMHelpers.js or to duplicate `const DOMPURIFY_CONFIG = {}` locally in sidebar.js.
   - Recommendation: Export from DOMHelpers.js for true single-source-of-truth. The import line is already going to sidebar.js.

3. **Duplicate cluster rendering block in showSessionSummary()**
   - What we know: Lines 815–855 in sidebar.js contain TWO separate cluster-rendering blocks (one using safeCreateElement DOM construction, one using innerHTML template). This appears to be a bug — they both write to `clustersContainer`. The second block at lines 844–855 uses raw innerHTML.
   - What's unclear: Which block is the "correct" one to keep.
   - Recommendation: For this phase, migrate both blocks through DOMPurify. Flag the duplicate for investigation/cleanup but do not remove either — that's a behavior change outside this phase's scope.

## Sources

### Primary (HIGH confidence)
- DOMPurify GitHub (https://github.com/cure53/DOMPurify) — version, loading pattern, API
- `unpkg.com/dompurify@3.3.1/dist/purify.es.mjs` — verified default ALLOWED_ATTR list includes `class`, `id`, `style`, `href`
- `github.com/cure53/DOMPurify/blob/main/package.json` — confirmed 3.3.1 is current version
- Codebase audit of `extension/sidebar/sidebar.js` and `extension/sidebar/utils/DOMHelpers.js` — complete innerHTML inventory

### Secondary (MEDIUM confidence)
- Chrome Extension Manifest V3 CSP docs (developer.chrome.com) — confirmed vendoring is required, local `'self'` scripts are allowed
- DOMPurify 3.3.1 release notes — no breaking changes, two minor enhancements

### Tertiary (LOW confidence)
- WebSearch results on DOMPurify + MV3 — no specific conflicts found; general MV3 principle of no remote scripts applies

## Metadata

**Confidence breakdown:**
- Standard stack (DOMPurify 3.3.1): HIGH — verified against official package.json and unpkg distribution
- Default allowed attributes (class, id, style, href): HIGH — verified against 3.3.1 ES module source
- innerHTML audit: HIGH — direct codebase inspection, line-by-line
- Architecture (script loading order): HIGH — based on how UMD + ES module interaction works in browsers
- Pitfalls: HIGH for items verified by code inspection; MEDIUM for CSP compatibility (no MV3 + DOMPurify conflict found, but no explicit confirmation either)

**Research date:** 2026-02-19
**Valid until:** 2026-08-19 (DOMPurify is stable; defaults are unlikely to change in a patch release)
