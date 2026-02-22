# Phase 12: Integration and Hardening - Research

**Researched:** 2026-02-20
**Domain:** Chrome Extension progressive loading, fallback state machines, consent UX
**Confidence:** HIGH — entire domain is the existing codebase; no external libraries required

## Summary

Phase 12 is a hardening and wiring phase, not a feature phase. Phases 8-11 built all the components (WASM engine, MiniLM encoder, GPU scheduler, cosine router, Qwen SLM, fallback UI). This phase verifies those components are correctly wired together, patches gaps in the progressive loading sequence, and updates the consent disclosure text. No new dependencies are introduced.

The three requirements (FBK-01, FBK-02, FBK-03) are largely already structurally satisfied by existing code — what remains is auditing edge cases, adding the "Loading semantic engine..." status text near the clustering badge, ensuring warm-start behaves correctly, and updating two strings in the consent modal. The biggest code change is adding a status text element near the badge during MiniLM initialization.

The consent modal update (FBK-03) is a one-line HTML change: replace "~450MB" with "~450MB language model" and add a note that a small encoder model (~23MB) loads automatically. The storage check threshold stays gated on 450MB (Qwen only, per decisions).

**Primary recommendation:** Audit existing wiring first (FBK-01 gate logic), then add the status text near the badge (FBK-02 UX), then patch consent modal copy (FBK-03). Three discrete, low-risk changes.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Loading waterfall UX**
- Subtle status text near the mode badge while MiniLM loads (e.g., "Loading semantic engine...") — no progress bar
- Seamless swap when semantic mode activates: next analysis cycle silently uses semantic results, no animation or re-sort
- Phase 11's "Basic mode" indicator shows in the summary area while Qwen loads — reuse existing fallback UI
- Downloads for MiniLM and Qwen run in parallel where safe (network downloads concurrent, GPU init steps serialized through the GPU scheduler)

**Fallback transitions**
- Silent fallback when encoder fails mid-session: badge switches to "Keyword" but no toast or alert
- When AI is disabled (no consent or toggled off), show subtle "Keyword" badge — no upsell or prompt to enable AI
- On keyword-to-semantic upgrade during initial load, only new messages get semantic routing — already-displayed messages stay in their keyword-assigned buckets
- If Qwen crashes or produces garbage, auto-retry once after a cooldown (~60s). If second attempt fails, stay in Basic mode for the session (user can manually retry via Phase 11's Retry AI button)

**Consent modal update**
- Update consent modal text to mention both models: a small encoder (~23MB) loads automatically, enabling AI adds a ~450MB language model
- Storage space check (navigator.storage.estimate) gates only on Qwen's ~450MB — MiniLM is small and likely already cached by the time the modal appears

**Cache warm-start**
- Brief loading state on warm-start: show "Restoring semantic engine..." while MiniLM re-initializes from cache
- Reuse Phase 11's "Basic mode" indicator for Qwen warm-start — no separate "Restoring AI..." text
- Trust the browser cache for model validity — no explicit corruption/version checks. Normal error fallback catches issues
- Same parallel-where-safe loading approach as cold start: downloads concurrent, GPU init serialized. Consistent behavior regardless of cache state

### Claude's Discretion
- Exact cooldown duration for Qwen auto-retry (suggested ~60s, flexible)
- Exact wording of status text ("Loading semantic engine...", "Restoring semantic engine...", etc.)
- How to integrate the status text near the existing Semantic/Keyword badge without cluttering the UI

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FBK-01 | WASM keyword clustering remains active as fallback when encoder hasn't loaded or AI is disabled | Existing gate logic at `sidebar.js:544` already implements this correctly; requires audit and verification testing only |
| FBK-02 | Progressive model loading sequence: WASM first (~1-2s), then MiniLM (~25MB cached), then Qwen (consent-gated) | Sequence already correct structurally; requires status text addition near clustering badge during MiniLM load phase; warm-start "Restoring..." text also needed |
| FBK-03 | Consent modal disclosure updated for Qwen2.5 model size (~950MB total) | `sidebar.html:94-95` currently says "~450MB AI model"; needs update to clarify encoder (~23MB auto) + Qwen (~450MB opt-in); combined ~950MB total |
</phase_requirements>

---

## Standard Stack

### Core (no new additions)
| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| WASM engine | `extension/wasm/` | Keyword clustering, topics, sentiment | Complete |
| encoder-adapter.js | `extension/sidebar/encoder-adapter.js` | MiniLM pipeline, hash cache, retry | Complete |
| cosine-router.js | `extension/sidebar/cosine-router.js` | Prototype vectors, cosine classification | Complete |
| llm-adapter.js | `extension/llm-adapter.js` | Qwen2.5, fallback engine, garbage detection | Complete |
| gpu-scheduler.js | `extension/sidebar/modules/gpu-scheduler.js` | Promise-chain mutex for GPU access | Complete |
| sidebar.js | `extension/sidebar/sidebar.js` | Orchestrator — wires all the above | Needs audit + small additions |

No new npm packages, no new files expected (one possible new CSS class for loading text).

### Supporting (already present)
| Component | Purpose | Notes |
|-----------|---------|-------|
| DOMHelpers.js | Safe DOM manipulation | Use `safeCreateElement` / `escapeHtml` for any new text elements |
| DOMPURIFY_CONFIG | XSS prevention | Already imported in sidebar.js |

---

## Architecture Patterns

### Current Progressive Loading Sequence (as-built)

```
initWasm() [sidebar.js line 371]
  ├── loadSettings()                          ~0s
  ├── WASM init (import + init)               ~1-2s → analysis ready immediately
  ├── initEncoderOnStartup() [fire-and-forget, non-blocking]
  │     ├── shows encoder progress bar
  │     ├── initEncoderWithRetry()            ~5-30s (cached: faster)
  │     │     └── initEncoder() → WebGPU or WASM backend
  │     ├── buildPrototypes()
  │     ├── setSemanticMode()
  │     └── catch-up encode of allMessages buffer
  └── checkAISettings()
        ├── if enabled: startLLMInitialization() [fire-and-forget]
        ├── if declined: llmEnabled = false
        └── if first-run: show consent modal
```

**This sequence is already correct for FBK-02.** The gap is the missing status text during the `initEncoderOnStartup` phase.

### FBK-01: Fallback Gate — How It Works Today

```javascript
// sidebar.js line 544
if (!encoderReady && getEncoderState() === 'loading') {
  // Encoder still initializing — defer analysis rendering
  return;
}
```

This gates on TWO conditions: `encoderReady === false` AND `state === 'loading'`.
- When state is `'error'`, the condition is false → falls through to WASM rendering. Correct.
- When state is `'idle'` (pre-init), the condition is also false → WASM renders. Correct.
- When encoder is loading, rendering defers but `allMessages` accumulates for catch-up. Correct.
- When `encoderReady = true`, gate is skipped → semantic path runs. Correct.

**Assessment:** FBK-01 is already correctly implemented. The plan needs a verification step (code audit + test scenario), not a code change.

**One gap found:** When `getEncoderState() === 'loading'`, stats still update (processedCount, window stats) but analysis sections are hidden. This is the intended behavior per decisions (WASM works immediately) but the status text currently says "Processing live chat..." which is misleading. The "Loading semantic engine..." text addresses this gap.

### FBK-02: Status Text Near Badge — Implementation Pattern

The existing badge lives in `sidebar.html`:
```html
<div id="clusters-header" class="clusters-header hidden">
  <h3 class="clusters-title">Clusters</h3>
  <span id="clustering-mode-badge" class="clustering-mode-badge">Keyword</span>
</div>
```

The badge area is inside `.clusters-header` which starts hidden. The status text ("Loading semantic engine...") should be visible BEFORE `clusters-header` is shown — i.e., while the encoder is loading. Two options:

**Option A (recommended):** Add a separate `<div id="encoder-status-text">` element immediately below the encoder progress bar in the HTML. Show/hide it during encoder init lifecycle. This avoids DOM restructuring of the badge area.

**Option B:** Add a `<span>` inside `clusters-header` next to the badge. This only works after first analysis renders (when `clusters-header` becomes visible), which may be after encoder is done — less useful.

Option A is recommended: it mirrors the encoder progress bar pattern already in place, just text-only (no progress bar per decision). The element should be hidden once `initEncoderOnStartup` completes (success or error).

**Status text lifecycle:**
1. `initEncoderOnStartup()` starts → show "Loading semantic engine..."
2. Success → hide text (MiniLM ready, badge switches to "Semantic")
3. Error (all retries exhausted) → hide text (badge stays "Keyword", WASM fallback active)
4. Warm-start (cached model): same flow, show "Restoring semantic engine..." → hide on complete

**Distinguishing cold vs warm start:** `env.useBrowserCache = true` is set in `encoder-adapter.js`. There is no exposed API from Transformers.js that indicates cache hit before init starts. The simplest approach: always say "Loading semantic engine..." on cold start (no cache entry), and "Restoring semantic engine..." on subsequent page opens if the model was previously loaded. Since `encoderState` resets to `'idle'` on page reload (module-level state is fresh each sidebar open), there is no in-memory signal for "warm vs cold". Options:

1. Always show "Loading semantic engine..." regardless — simplest, loses warm-start text distinction
2. Check `chrome.storage.local` for a flag set after first successful encode — allows "Restoring..." on subsequent opens
3. Check Transformers.js progress events: if `'done'` fires quickly (< 2s) with no `'progress'` events at meaningful %, treat as cache hit

**Option 2 is recommended** (set a `miniLMCached` flag in `chrome.storage.local` after first successful encoder init, read it on next open to decide which text to show). This is a small, reliable signal. Option 3 is fragile.

### FBK-02: Qwen Auto-Retry After Cooldown

Currently (Phase 11): garbage detection triggers immediate fallback (no retry). The locked decision adds: auto-retry once after ~60s cooldown. If second attempt fails, stay in Basic mode (user can manually retry via Phase 11's Retry AI button).

**Current garbage path in llm-adapter.js:**
```javascript
if (isGarbage) {
  _garbageCount++;
  if (_garbageCount >= MAX_GARBAGE_BEFORE_FALLBACK) {
    _inFallback = true;
    engine = createFallbackEngine();
  }
}
```

**What needs to change:** After setting `_inFallback = true`, schedule a one-time auto-retry after ~60s cooldown. The retry should:
1. Call `retryLLM()` silently (no progress UI)
2. If `retryLLM()` succeeds → `_inFallback = false`, clear fallback notice
3. If `retryLLM()` fails again → keep `_inFallback = true`, stay in Basic mode

This auto-retry belongs in `llm-adapter.js` (where the fallback state lives), not `sidebar.js`. The retry outcome affects `_inFallback`, which `updateFallbackNotice()` reads. Since `updateFallbackNotice()` is called on the next LLM interaction cycle anyway, the sidebar will pick up the state change on the next `generateAISummary` or `updateMoodIndicator` call.

**Implementation detail:** Use `setTimeout` for the cooldown. A module-level `_autoRetryScheduled` flag prevents double-scheduling.

### FBK-03: Consent Modal Update

Current text in `sidebar.html` lines 93-96:
```html
<p>Enable AI-powered summaries and mood analysis?</p>
<p class="modal-detail">
  All processing happens locally — no chat data leaves your browser.
  Enabling this will download a ~450MB AI model from HuggingFace on first use.
  The model is stored locally and persists across browser sessions.
</p>
```

Current storage warning in `sidebar.html` line 102-104:
```html
<p id="llm-space-warning" class="modal-warning hidden">
  Not enough disk space available (~450MB needed)
</p>
```

**Required update:** Distinguish the two models clearly:
- Encoder (MiniLM, ~23MB): loads automatically, already downloaded/cached
- Language model (Qwen2.5, ~450MB): only if user enables AI
- Combined if both: ~473MB (round to ~950MB is overstated — see note below)

**Note on "~950MB total" from REQUIREMENTS.md FBK-03:** The requirement says "~950MB total for Qwen2.5 + MiniLM". However, `extension/WEBLLM_SETUP.md` (the authoritative source in this repo) states the actual Qwen2.5-0.5B-Instruct-q4f16_1 download is "~400MB". Combined with MiniLM (~23MB), the actual total is approximately 423MB, not ~950MB. The ~950MB figure in REQUIREMENTS.md is significantly overstated and should not appear in user-facing consent text. Use the honest figures: ~23MB encoder (auto) + ~400MB language model (opt-in). The sidebar.html currently says "~450MB" which is already slightly overstated but within acceptable rounding. The consent text update should say "~400MB" to match WEBLLM_SETUP.md.

**Revised consent modal text pattern:**
```
A small encoder model (~23MB) loads automatically to power semantic clustering.
Enabling AI adds a language model (~400MB) downloaded from HuggingFace on first use.
All processing happens locally — no chat data leaves your browser.
```

Storage warning text update: "Not enough disk space available (~400MB needed for the AI language model)"

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cooldown timer | Custom scheduler | `setTimeout` with `_autoRetryScheduled` flag | Already a module-level pattern in this codebase |
| Cache detection | Parse Transformers.js internals | `chrome.storage.local` flag set after first success | Simple, reliable, no internal API coupling |
| Status text animation | CSS animation library | CSS `transition: opacity` (already used for encoder progress) | Consistent with existing fade-out pattern |
| Model size verification | Fetch model metadata | Check WebLLM bundle or WEBLLM_SETUP.md | Sizes are known constants, not dynamic |

---

## Common Pitfalls

### Pitfall 1: Double-Init Race on Warm-Start
**What goes wrong:** `initEncoderOnStartup()` is fire-and-forget. On warm-start, if the model loads very quickly from cache, `encoderReady` may be set to `true` before `processMessages()` is called for the first time — but the status text was never shown.
**Why it happens:** The encoder loads faster than first messages arrive on cached runs.
**How to avoid:** Show the status text immediately in `initEncoderOnStartup()` before the `await initEncoderWithRetry()` call, not after. The text becomes briefly visible and disappears quickly on fast cache hits — this is acceptable and expected.
**Warning signs:** Status text never appears on warm-start.

### Pitfall 2: Encoder Gate Blocks Too Aggressively
**What goes wrong:** The gate `if (!encoderReady && getEncoderState() === 'loading') return;` defers ALL rendering including clusters. If the encoder takes 30s to download, users see a blank clusters area for 30 seconds.
**Why it happens:** The gate is intentional (per 10-02 decisions) but the UX depends on WASM rendering being unblocked. Verify: what happens when `encoderState === 'loading'` on FIRST message? The gate fires and returns early. Users see stats update but no clusters.
**Current behavior verified:** This IS the intended behavior per the 10-02 decision ("WASM renders clusters synchronously for immediate display; async scheduleEncode callback overwrites with cosine buckets when embeddings arrive"). BUT the gate contradicts this: it explicitly returns early and does NOT render WASM clusters during loading.
**Resolution:** The gate at line 544 is for the encoder-loading phase only. If this causes a blank display, the fix is to NOT return early but instead skip only the `scheduleEncode` call. This may need investigation during plan execution.

### Pitfall 3: `_inFallback` Reset on Qwen Auto-Retry Failure
**What goes wrong:** `retryLLM()` calls `initializeLLM()` which can load the fallback engine on bundle error — in this case `_inFallback` remains false but the engine is the fallback engine. The auto-retry "succeeds" but the user gets fallback behavior without `_inFallback === true`.
**Why it happens:** `retryLLM()` sets `_inFallback = false` before calling `initializeLLM()`. If `initializeLLM()` falls through to the fallback engine path, `_inFallback` stays false.
**How to avoid:** After auto-retry, check `engine._isFallback` — if true, set `_inFallback = true` again to ensure the fallback notice remains visible.

### Pitfall 4: Consent Text Cites ~950MB When Actual Is ~423MB
**What goes wrong:** FBK-03 requirement says "~950MB total" but `extension/WEBLLM_SETUP.md` confirms the actual Qwen2.5-0.5B-Instruct-q4f16_1 download is "~400MB". Combined with MiniLM (~23MB), total is ~423MB. Stating ~950MB overstates by more than 2x and will unnecessarily deter users.
**Why it happens:** The ~950MB figure in REQUIREMENTS.md appears to be incorrect — possibly confused with a larger model variant.
**How to avoid:** Use ~400MB (from WEBLLM_SETUP.md) for Qwen and ~23MB for MiniLM in consent text. Do not propagate the ~950MB figure into user-facing copy.

### Pitfall 5: Status Text Element Clutters the Badge Area
**What goes wrong:** Adding status text near the `clustering-mode-badge` inside `clusters-header` means it shows before any clusters are rendered (clusters-header starts hidden) — so the text would never be visible.
**Why it happens:** `clusters-header` only becomes visible in `processMessages()` after first analysis.
**How to avoid:** Use Option A from architecture patterns above — place the status text element OUTSIDE `clusters-header`, as a standalone hidden element shown only during MiniLM init. Position it below the encoder progress bar area.

---

## Code Examples

### Adding Status Text Element (HTML)
```html
<!-- Place after encoder-progress div, before header -->
<div id="encoder-status-text" class="encoder-status-text hidden">
  Loading semantic engine...
</div>
```

### CSS for Status Text (minimal, reuse existing variables)
```css
.encoder-status-text {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px 0;
}
```

### Showing/Hiding Status Text in initEncoderOnStartup()
```javascript
async function initEncoderOnStartup() {
  // Determine warm vs cold start
  const { miniLMCached } = await chrome.storage.local.get('miniLMCached');
  const statusEl = document.getElementById('encoder-status-text');

  if (statusEl) {
    statusEl.textContent = miniLMCached
      ? 'Restoring semantic engine...'
      : 'Loading semantic engine...';
    statusEl.classList.remove('hidden');
  }

  // ... existing encoder progress bar code ...

  const result = await initEncoderWithRetry(onProgress, onError);

  // Hide status text regardless of outcome
  if (statusEl) statusEl.classList.add('hidden');

  if (result !== null) {
    // ... existing success path ...
    // Mark MiniLM as cached for next warm-start
    chrome.storage.local.set({ miniLMCached: true });
  }
}
```

### Qwen Auto-Retry in llm-adapter.js
```javascript
let _autoRetryScheduled = false;
const GARBAGE_RETRY_COOLDOWN_MS = 60_000; // Claude's discretion: 60s

// Inside the isGarbage block (after existing fallback logic):
if (_garbageCount >= MAX_GARBAGE_BEFORE_FALLBACK && !_autoRetryScheduled) {
  _autoRetryScheduled = true;
  setTimeout(async () => {
    _autoRetryScheduled = false;
    _inFallback = false;
    _garbageCount = 0;
    engine = null;
    isInitialized = false;
    isInitializing = false;
    try {
      await initializeLLM(); // silent, no progress callback
      // Check if we got a real engine or fell back again
      if (engine && engine._isFallback) {
        _inFallback = true;
      }
    } catch (_) {
      _inFallback = true;
    }
  }, GARBAGE_RETRY_COOLDOWN_MS);
}
```

### Consent Modal Updated Text Pattern
```html
<p class="modal-detail">
  All processing happens locally — no chat data leaves your browser.
  A small encoder model (~23MB) loads automatically to power clustering.
  Enabling AI adds a language model (~400MB) downloaded from HuggingFace on first use.
  Both models are stored locally and persist across browser sessions.
</p>
<p id="llm-space-warning" class="modal-warning hidden">
  Not enough disk space available (~400MB needed for the AI language model)
</p>
```

---

## Current Code Audit Findings

### FBK-01 Audit: WASM Fallback Gate
**File:** `extension/sidebar/sidebar.js` lines 541-548
**Status:** Gate logic is correct. The two conditions (`!encoderReady` AND `getEncoderState() === 'loading'`) properly allow WASM rendering when encoder is in `error` or `idle` states.

**Concern flagged (Pitfall 2):** During `'loading'` state, the gate returns early — no WASM clusters are rendered. This means on cold start, the clusters section stays blank for the entire encoder download period (up to 30s on slow connections). The STATE.md 10-02 decision says "WASM renders clusters synchronously for immediate display" but the current gate prevents this. This inconsistency should be explicitly verified and resolved in the plan.

**Option A (no change):** Accept blank clusters during encoder loading. Status text makes it clear what's happening.
**Option B (preferred):** Remove the early return; instead, render WASM clusters normally AND skip the `scheduleEncode` call at the end of `processMessages`. This achieves the originally intended "WASM works immediately" behavior.

**Recommended:** Investigate during plan. If clusters are currently blank during loading, fix with Option B.

### FBK-02 Audit: Encoder init vs Qwen init parallelism
**File:** `extension/sidebar/sidebar.js` lines 388-393
```javascript
// Start encoder loading in background — non-blocking, does not delay WASM analysis
initEncoderOnStartup();

// Check AI settings and show consent modal if needed
await checkAISettings();
```

`initEncoderOnStartup()` is fire-and-forget (no await), then `checkAISettings()` is awaited. If user has already consented, `checkAISettings()` calls `startLLMInitialization()` which is also fire-and-forget. So both encoder and Qwen downloads start nearly simultaneously (within milliseconds). Network downloads are concurrent. GPU init steps go through the scheduler. This matches the "downloads concurrent, GPU init serialized" decision. **Already correct.**

### FBK-03 Audit: Consent Modal Text
**File:** `extension/sidebar/sidebar.html` lines 93-106
**Current text:** "download a ~450MB AI model from HuggingFace"
**Issue:** No mention of MiniLM auto-download. Users may be surprised by the 23MB download that happens regardless of consent.
**Fix:** Update modal-detail paragraph and llm-space-warning text as shown in Code Examples.

**Model size verification needed:** Check `extension/WEBLLM_SETUP.md` for the actual Qwen model size.

---

## Open Questions

1. **Actual Qwen2.5-0.5B-Instruct-q4f16_1-MLC download size**
   - What we know: `extension/WEBLLM_SETUP.md` states "~400MB (Qwen2.5-0.5B-Instruct-q4f16_1)". REQUIREMENTS.md FBK-03 says "~950MB total" — this is significantly overstated.
   - What's clear: Use ~400MB for Qwen, ~23MB for MiniLM in consent text. The ~950MB figure should not appear in user-facing copy.
   - Recommendation: The planner should use ~400MB in consent text and update REQUIREMENTS.md's FBK-03 description to reflect accurate sizes. RESOLVED.

2. **WASM Gate Behavior During Loading**
   - What we know: Gate at sidebar.js:544 returns early when `getEncoderState() === 'loading'`
   - What's unclear: Does this mean users see blank clusters for 5-30s? Or does WASM render before encoder starts?
   - Recommendation: The planner should include a test step: load extension, open a stream, observe whether clusters appear before MiniLM finishes.

3. **`retryLLM()` success when bundle missing**
   - What we know: `retryLLM()` calls `initializeLLM()` which falls back to `createFallbackEngine()` if bundle not found
   - What's unclear: Should auto-retry be skipped entirely when `engine._isFallback` was the original state (not a garbage-triggered fallback)?
   - Recommendation: Auto-retry only makes sense when the REAL Qwen engine was running and produced garbage. If `engine._isFallback` is already set because the bundle was never found, don't schedule auto-retry. Check `engine._isFallback` before entering the garbage retry path.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `extension/sidebar/sidebar.js` — loading sequence, gate logic, DOM wiring
- Direct codebase inspection: `extension/sidebar/encoder-adapter.js` — encoder state machine, retry logic
- Direct codebase inspection: `extension/llm-adapter.js` — fallback state, garbage detection, retryLLM
- Direct codebase inspection: `extension/sidebar/sidebar.html` — consent modal text, DOM element IDs
- Direct codebase inspection: `extension/sidebar/cosine-router.js` — mode state, prototype vectors
- `.planning/STATE.md` — accumulated decisions from phases 8-11

### Secondary (MEDIUM confidence)
- REQUIREMENTS.md FBK-03 "~950MB total" figure — needs verification against actual model

---

## Metadata

**Confidence breakdown:**
- FBK-01 (WASM fallback gate): HIGH — code is directly readable, gate logic is clear
- FBK-02 (progressive loading + status text): HIGH — architecture is clear; discretionary items (exact wording, element placement) are well-scoped
- FBK-02 (Qwen auto-retry): HIGH — pattern is clear; implementation is contained to llm-adapter.js
- FBK-03 (consent modal): HIGH — HTML edit is trivial; model size claim needs verification (MEDIUM for that specific value)
- Pitfall identification: HIGH — based on direct code reading of the gate logic and state machine

**Research date:** 2026-02-20
**Valid until:** Stable — this phase touches only this codebase with no external dependencies
