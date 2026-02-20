# Phase 5: Manifest Audit and Disclosure UI - Research

**Researched:** 2026-02-19
**Domain:** Chrome Extension Manifest V3, Web Storage API, Consent Modal UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Consent modal copy:**
- Name HuggingFace explicitly as the download source — don't use generic "external CDN"
- State the ~450MB requirement without showing dynamic available space (no need to display navigator.storage.estimate() result in the modal text)
- Privacy-forward tone — lead with local-only processing, emphasize no data leaves the browser
- Explicitly mention persistent storage — "The model is stored locally and persists across browser sessions"

**Insufficient space UX:**
- Grey out "Enable AI" button when space is insufficient, show inline message below it ("Not enough disk space available (~450MB needed)")
- Space threshold: 450MB (model size + IndexedDB overhead buffer)
- When space is insufficient, change "Skip for now" to "Continue without AI" to clarify it's the only viable option
- If navigator.storage.estimate() API is unavailable, allow the download attempt — let it fail naturally rather than blocking

**Manifest description:**
- Frame as "creator dashboard" — "Real-time dashboard for..."
- Name specific features: message clusters, sentiment, trending topics, session history
- Name platforms: YouTube and Twitch
- Mention optional AI summaries as a differentiator

**CSP cleanup:**
- Remove raw.githubusercontent.com from connect-src only if grep confirms no code fetches from it
- Keep huggingface.co and cdn-lfs.huggingface.co at domain level — don't attempt path-specific restrictions (WebLLM uses various paths)
- Full CSP review — verify script-src and object-src are minimal and justified, not just connect-src
- Add brief comments near manifest CSP (or adjacent doc) explaining why each entry exists

### Claude's Discretion
- Exact wording of the consent modal (within the tone and content constraints above)
- How to structure CSP justification comments (inline vs separate file)
- Whether wasm-unsafe-eval and object-src 'self' need changes after full review

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MNFST-01 | Add `unlimitedStorage` permission to manifest.json for WebLLM IndexedDB model cache (~400MB) | `unlimitedStorage` is a named Chrome extension permission; adding it to `"permissions"` array exempts extension from IndexedDB quota limits and eviction. Confirmed in Chrome docs. |
| MNFST-02 | Increment manifest version from `0.1.0` to `1.1.0` for CWS submission | Chrome version field accepts 1–4 dot-separated integers, each 0–65535. "1.1.0" is a valid format. Current value is "0.1.0". |
| MNFST-03 | Audit `connect-src` CSP — remove `raw.githubusercontent.com` if unused, justify remaining HuggingFace entries | **Critical finding:** `raw.githubusercontent.com` IS actively used by the bundled WebLLM library (`libs/web-llm/index.js:918`) to fetch WebGPU shader WASM files (`model_lib` URLs). The entry must remain in `connect-src`. |
| MNFST-04 | Update manifest description to single-purpose framing covering all features (clustering, sentiment, topics, session history) | CWS single-purpose policy allows multiple features under one narrow focus area. Description field has no hard character limit in manifest spec; CWS listing description is separate. |
| DISC-01 | Disk space warning shown before WebLLM model download using `navigator.storage.estimate()` — disable "Enable AI" button if insufficient space (~450MB needed) | `navigator.storage.estimate()` returns `{quota, usage}` in bytes. Available = quota - usage. Threshold is 450MB = 471,859,200 bytes. API is available in secure contexts (extension pages qualify). Graceful degradation if API unavailable: allow attempt. |
| DISC-02 | Consent modal discloses persistent disk usage and download source (HuggingFace CDN) | Current modal text ("~400MB model") is the starting point. Enhance with: HuggingFace as source, persistent storage note, local-only processing emphasis. All changes are in `sidebar.html` modal HTML and `sidebar.js` for the storage check. |
</phase_requirements>

## Summary

Phase 5 involves four targeted changes: two manifest.json edits (add `unlimitedStorage` permission, bump version, update description, keep CSP entries), and two consent modal changes (enhance disclosure text, add storage availability check that gates the "Enable AI" button). All changes touch a small number of files with no new dependencies.

The most critical research finding is that `raw.githubusercontent.com` in `connect-src` must be KEPT. The bundled WebLLM library (`extension/libs/web-llm/index.js`, line 918) defines `modelLibURLPrefix = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/"` and uses it for all `model_lib` WASM shader URLs. Removing it would break WebLLM. The CONTEXT.md decision to "remove only if grep confirms no code fetches from it" means this grep will confirm it IS used, and the entry stays.

A secondary finding: the model ID in `llm-adapter.js` is `'Phi-2-q4f16_1-MLC'` (capital P) while the WebLLM bundle registers it as `'phi-2-q4f16_1-MLC'` (lowercase p). This is an existing bug outside Phase 5 scope but worth noting for awareness. The `vram_required_MB` for this model is 3053.97MB — larger than the 450MB disk estimate in the consent modal. The 450MB figure refers to model weights stored on disk (compressed), not VRAM. This is consistent with the user's 450MB threshold decision.

**Primary recommendation:** Make all changes directly to `extension/manifest.json` and `extension/sidebar/sidebar.html` + `extension/sidebar/sidebar.js`. No new libraries required. Storage check is a single async call at modal display time.

## Standard Stack

### Core

| Component | Version/Source | Purpose | Why Standard |
|-----------|---------------|---------|--------------|
| `manifest.json` | MV3 schema | Extension configuration | Single authoritative config file |
| `navigator.storage.estimate()` | Web API (StorageManager) | Check available quota before download | No permission required, graceful degradation supported, available in extension pages |
| HTML `disabled` attribute | HTML spec | Gate "Enable AI" button | Native browser behavior, no JS needed for visual state; still need JS to set it |
| CSS `:disabled` pseudo-class | CSS spec | Style greyed-out button | Already used in project patterns |

### Supporting

| Component | Version/Source | Purpose | When to Use |
|-----------|---------------|---------|-------------|
| `chrome.storage.sync` | Chrome API | Read existing settings in consent flow | Already in use — no change needed |
| Inline HTML comments | N/A | CSP justification near the policy string | When comments must live adjacent to the policy they document (manifest.json does not support comments natively — see pitfalls) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `navigator.storage.estimate()` | `chrome.system.storage` | `chrome.system.storage` requires an additional manifest permission; `navigator.storage.estimate()` requires none. Decision already locked. |
| Inline modal disclosure | Separate "learn more" link | User must click to see info; decision locked to show it inline |
| Domain-level CSP (`huggingface.co`) | Path-specific CSP | WebLLM uses multiple paths under HuggingFace; path-specific restrictions would be fragile. Decision locked. |

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes touch existing files:

```
extension/
├── manifest.json               # EDIT: version, permissions, description, CSP comments
└── sidebar/
    ├── sidebar.html            # EDIT: consent modal HTML (disclosure text + space-warning element)
    └── sidebar.js              # EDIT: storage check logic + button disable/enable
```

### Pattern 1: Manifest Permission Addition

**What:** Add `"unlimitedStorage"` to the `"permissions"` array alongside existing `"storage"`.
**When to use:** When extension stores data >10MB in IndexedDB, Cache Storage, or OPFS. WebLLM model cache qualifies.

```json
{
  "permissions": [
    "sidePanel",
    "storage",
    "unlimitedStorage"
  ]
}
```

**Source:** Chrome Developers — chrome.storage API, Storage and cookies concept doc

### Pattern 2: Storage Availability Check

**What:** Call `navigator.storage.estimate()` before showing or enabling the AI download option. Disable button and show message if insufficient space.
**When to use:** Any pre-download disclosure where user should not be surprised by storage consumption.

```javascript
// At modal display time, before user can click Enable AI
async function checkStorageAvailability() {
  const REQUIRED_BYTES = 450 * 1024 * 1024; // 450MB

  if (!navigator.storage || !navigator.storage.estimate) {
    // API unavailable — allow attempt (per locked decision)
    return { sufficient: true, available: null };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const available = estimate.quota - estimate.usage;
    return { sufficient: available >= REQUIRED_BYTES, available };
  } catch (err) {
    // On error, allow attempt rather than blocking
    console.warn('[LLM Consent] Storage estimate failed:', err);
    return { sufficient: true, available: null };
  }
}

// Apply to modal
async function applyStorageCheck() {
  const { sufficient } = await checkStorageAvailability();
  const enableBtn = document.getElementById('llm-enable-btn');
  const skipBtn = document.getElementById('llm-skip-btn');
  const warningEl = document.getElementById('llm-space-warning');

  if (!sufficient) {
    enableBtn.disabled = true;
    warningEl.classList.remove('hidden');
    skipBtn.textContent = 'Continue without AI';
  }
}
```

**Source:** MDN StorageManager.estimate() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate

### Pattern 3: Manifest CSP with Justification

**What:** Since JSON does not support inline comments, justification notes go in a companion markdown file (e.g., `docs/cws-justifications.md` already exists) or a `csp-notes.md` adjacent to the manifest. Do NOT attempt JSON comments (`//`) — they break JSON parsing.
**When to use:** Any time CSP entries need explanation for future maintainers or CWS reviewers.

The existing file `docs/cws-justifications.md` (created in Phase 4) is the correct location for CSP rationale. Add a CSP section there.

### Pattern 4: Consent Modal HTML Changes

Current modal HTML (in `sidebar.html`):
```html
<div id="llm-consent-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content llm-consent-content">
    <h3>AI Features Available</h3>
    <p>Enable AI-powered summaries and mood analysis?</p>
    <p class="modal-detail">This downloads a ~400MB model on first use. Processing happens locally - no data sent to servers.</p>
    <div class="modal-actions">
      <button id="llm-enable-btn" class="btn btn-primary">Enable AI</button>
      <button id="llm-skip-btn" class="btn btn-secondary">Skip for now</button>
    </div>
    <p class="modal-hint">You can change this later in Settings.</p>
  </div>
</div>
```

Required changes:
1. Expand `modal-detail` paragraph to include: HuggingFace as source, persistent storage note, local-only processing emphasis
2. Add a new `id="llm-space-warning"` element (hidden by default) below the action buttons
3. Button text changes to "Continue without AI" are applied via JS when space is insufficient

### Anti-Patterns to Avoid

- **JSON comments in manifest.json:** JSON does not support `//` comments. Any comment-like addition will break parsing. CSP justifications belong in an external markdown file.
- **Blocking on storage API unavailability:** If `navigator.storage.estimate()` throws or is undefined, silently allow the attempt. Do not show an error to the user.
- **Showing available space numbers in the modal:** The locked decision explicitly says NOT to display the available space estimate in the modal text — only state the ~450MB requirement.
- **Removing `raw.githubusercontent.com` from CSP:** The bundled WebLLM library fetches WebGPU WASM shaders from this domain at runtime. Removing it will break AI features silently.
- **Setting `disabled` in HTML without JS to remove it:** The button should start enabled (in case the storage API check is slow), then the JS check disables it if needed. Or: start with a loading state and apply after the check resolves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storage quota check | Custom quota detection heuristic | `navigator.storage.estimate()` | Native browser API, returns accurate origin quota, handles all edge cases |
| Button disabled styling | Custom CSS class for greyed state | HTML `disabled` attribute + CSS `:disabled` | Native behavior, screen reader compatible, prevents click events automatically |
| CSP domain validation | Parse or verify CSP string in code | Manual grep + review against official MDN CSP docs | CSP parsing is complex; grep-based verification is sufficient for this use case |

**Key insight:** All primitives for this phase exist natively in the browser or in existing project files. Zero new libraries needed.

## Common Pitfalls

### Pitfall 1: JSON Does Not Allow Comments

**What goes wrong:** Developer adds `// CSP justification` comments inside `manifest.json` to document each CSP entry, causing Chrome to reject the manifest entirely with a parse error.
**Why it happens:** Confusion between JSON (strict) and JavaScript (allows comments). Chrome's manifest parser is strict JSON.
**How to avoid:** All CSP rationale goes in `docs/cws-justifications.md` (already exists from Phase 4). Reference that file in PR/commit message.
**Warning signs:** `chrome://extensions/` shows "Manifest file is invalid JSON" or extension fails to load.

### Pitfall 2: raw.githubusercontent.com Removal Breaks WebLLM

**What goes wrong:** Grep search is run only on first-party extension JS files, missing that `libs/web-llm/index.js` is a bundled third-party library. The entry is "removed" and WebLLM silently fails to load models.
**Why it happens:** The grep scope excludes `libs/` directory or the search is limited to `extension/*.js` rather than `extension/**/*.js`.
**How to avoid:** Always include `libs/web-llm/index.js` in the grep. Confirmed: line 918 uses `modelLibURLPrefix = "https://raw.githubusercontent.com/..."`.
**Warning signs:** WebLLM initialization fails with a network error or CSP violation in the console after enabling AI.

### Pitfall 3: navigator.storage.estimate() Reports Quota Not Free Disk Space

**What goes wrong:** Developer interprets `estimate.quota` as total disk space, or `estimate.quota - estimate.usage` as OS-level free space.
**Why it happens:** The API name is misleading. Chrome caps the quota at 60% of total disk size for regular origins. Extensions with `unlimitedStorage` are exempt from the cap, but the API may still report the non-unlimited quota until the extension is loaded with the permission.
**How to avoid:** Use the calculation as an approximation for whether download will likely succeed. The decision to use 450MB as threshold (larger than model weight download) already accounts for this imprecision. Do not assert the check is authoritative.
**Warning signs:** Available space shown is much lower than actual free disk space on user's machine.

### Pitfall 4: Consent Modal Button State Race Condition

**What goes wrong:** Storage check is async; the modal appears before the check resolves. User clicks "Enable AI" before the button is disabled.
**Why it happens:** `checkAISettings()` shows the modal before awaiting storage check.
**How to avoid:** Either (a) await the storage check before removing 'hidden' from the modal, or (b) show the modal with the button in a loading/disabled state, then enable/disable after check resolves. Option (a) is simpler and preferred.
**Warning signs:** Enable button remains clickable briefly before being disabled.

### Pitfall 5: version_name vs version Field Confusion

**What goes wrong:** Developer sets `"version_name": "1.1.0"` instead of `"version": "1.1.0"`, leaving the actual version at `"0.1.0"`.
**Why it happens:** Chrome supports an optional `version_name` field for display purposes, separate from the functional `version` field used for update checking.
**How to avoid:** Edit the `"version"` field directly. Optionally add `"version_name"` as a display string, but that is not required.
**Warning signs:** CWS shows old version number after submission.

## Code Examples

### Storage Check with Graceful Degradation

```javascript
// Source: MDN StorageManager.estimate()
// https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate

const REQUIRED_BYTES = 450 * 1024 * 1024; // 450MB in bytes

async function checkStorageAvailability() {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return { sufficient: true }; // API unavailable — allow attempt
  }
  try {
    const { quota, usage } = await navigator.storage.estimate();
    const available = quota - usage;
    return { sufficient: available >= REQUIRED_BYTES };
  } catch (err) {
    console.warn('[LLM Consent] Storage estimate failed:', err);
    return { sufficient: true }; // On error — allow attempt
  }
}
```

### Consent Modal Storage Gate (integrated into existing checkAISettings flow)

```javascript
// In sidebar.js — modification to the section that shows llm-consent-modal

// Show consent modal — but first check storage
async function showConsentModal() {
  const { sufficient } = await checkStorageAvailability();

  const enableBtn = document.getElementById('llm-enable-btn');
  const skipBtn = document.getElementById('llm-skip-btn');
  const warningEl = document.getElementById('llm-space-warning');

  if (!sufficient) {
    enableBtn.disabled = true;
    warningEl.classList.remove('hidden');
    skipBtn.textContent = 'Continue without AI';
  }

  llmConsentModal.classList.remove('hidden');
}
```

### Consent Modal Enhanced HTML

```html
<!-- In sidebar.html — replacing existing llm-consent-modal inner content -->
<div id="llm-consent-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content llm-consent-content">
    <h3>AI Features Available</h3>
    <p>Enable AI-powered summaries and mood analysis?</p>
    <p class="modal-detail">
      All processing happens locally — no chat data leaves your browser.
      Enabling this will download a ~450MB AI model from HuggingFace on first use.
      The model is stored locally and persists across browser sessions.
    </p>
    <div class="modal-actions">
      <button id="llm-enable-btn" class="btn btn-primary">Enable AI</button>
      <button id="llm-skip-btn" class="btn btn-secondary">Skip for now</button>
    </div>
    <p id="llm-space-warning" class="modal-warning hidden">
      Not enough disk space available (~450MB needed)
    </p>
    <p class="modal-hint">You can change this later in Settings.</p>
  </div>
</div>
```

### manifest.json Final State (relevant sections)

```json
{
  "name": "Chat Signal Radar",
  "version": "1.1.0",
  "description": "Real-time creator dashboard for YouTube and Twitch live chat. Clusters messages into questions, issues, and requests; tracks sentiment, trending topics, and session history. Optional AI summaries.",
  "permissions": [
    "sidePanel",
    "storage",
    "unlimitedStorage"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;"
  }
}
```

### CSS for Warning and Disabled Button State

```css
/* Add to sidebar.css — modal warning message */
.modal-warning {
  font-size: 12px;
  color: var(--text-danger, #c0392b);
  margin-top: 8px;
  text-align: center;
}

/* Disabled button state — may already exist via :disabled, verify */
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MV2 CSP as string | MV3 CSP as object with `extension_pages` key | MV3 (Chrome 88+) | `extension_pages` is the correct key; already correct in manifest |
| `'unsafe-eval'` in script-src | `'wasm-unsafe-eval'` only | MV3 requirement | Already correct; needed for WASM loading |
| `storage` covers all storage APIs | `unlimitedStorage` needed separately for >10MB IndexedDB | Always true | Missing from current manifest — must add |

**Deprecated/outdated:**
- `chrome.system.storage` for quota checks: Requires additional `system.storage` permission; `navigator.storage.estimate()` is the current standard with no permission overhead.

## Open Questions

1. **Does the Phi-2 model ID case mismatch matter for Phase 5?**
   - What we know: `llm-adapter.js` requests `'Phi-2-q4f16_1-MLC'` but WebLLM bundle registers `'phi-2-q4f16_1-MLC'` (lowercase p). The bundled WebLLM model list also shows `vram_required_MB: 3053.97` for this model — meaning it requires 3GB VRAM, not 450MB disk.
   - What's unclear: Whether WebLLM's model lookup is case-sensitive, and what the actual compressed download size of Phi-2 is (the 450MB figure in CONTEXT.md may be based on a different model or approximate disk footprint).
   - Recommendation: Flag to user but don't fix in Phase 5. The 450MB disk threshold is a user-set decision and reasonable for consent purposes regardless of exact model.

2. **Should wasm-unsafe-eval remain in script-src?**
   - What we know: The WASM engine (`wasm_engine_bg.wasm`) is loaded via `chrome.runtime.getURL()` and initialized with `await init(wasmBinaryPath)`. WASM loading in Chrome requires `'wasm-unsafe-eval'` in `script-src`.
   - What's unclear: Whether WebLLM's shader WASMs also require this directive.
   - Recommendation: Keep `'wasm-unsafe-eval'`. It is the minimum required for WASM and the Chrome docs confirm it as the correct directive (not `'unsafe-eval'`).

3. **Does unlimitedStorage affect navigator.storage.estimate() reporting for the extension?**
   - What we know: Normally `estimate().quota` reflects Chrome's 60%-of-disk cap. With `unlimitedStorage`, extensions are exempt from quotas. The API may still report the pre-unlimited quota.
   - What's unclear: Whether adding `unlimitedStorage` changes what `estimate()` returns for the extension origin.
   - Recommendation: This doesn't affect Phase 5 implementation — the check is still a best-effort approximation, and the graceful-degradation path handles cases where the estimate is wrong.

## Sources

### Primary (HIGH confidence)

- Chrome Developers — Manifest: version field — https://developer.chrome.com/docs/extensions/reference/manifest/version — verified valid format for "1.1.0"
- Chrome Developers — Storage and cookies — https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies — confirmed `unlimitedStorage` exempts from quota + eviction
- Chrome Developers — MV3 Requirements — https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements — remote code policy; `connect-src` not explicitly restricted beyond script-src rules
- MDN — StorageManager.estimate() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate — `{quota, usage}` fields, available = quota - usage pattern
- Direct code inspection — `extension/libs/web-llm/index.js:918` — confirms `raw.githubusercontent.com` is used for model_lib WASM shader URLs

### Secondary (MEDIUM confidence)

- Chrome Developers — CSP reference — https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy — minimum policy is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`; `connect-src` additions are permitted in MV3
- Chrome Developers — Quality Guidelines FAQ — https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq — single-purpose policy allows multiple related features under one focus area
- WebSearch result — `unlimitedStorage` exempts IndexedDB from quota and eviction (multiple sources agree, consistent with Chrome docs)

### Tertiary (LOW confidence)

- WebSearch — Phi-2 model download size ~400-450MB (not verified with authoritative source; the 450MB threshold comes from user decision, not confirmed model spec)

## Metadata

**Confidence breakdown:**
- Manifest changes (version, permission, description): HIGH — Chrome docs confirm format and permission semantics
- CSP analysis (keep raw.githubusercontent.com): HIGH — direct code inspection of bundled WebLLM
- Storage API usage: HIGH — MDN confirms API shape and behavior
- Disclosure modal copy: HIGH — requirements are locked decisions; implementation is straightforward HTML edits
- Phi-2 model size claim (450MB): LOW — user decision, not independently verified against model specs

**Research date:** 2026-02-19
**Valid until:** 2026-05-19 (stable APIs; Chrome extension manifest spec changes infrequently)
