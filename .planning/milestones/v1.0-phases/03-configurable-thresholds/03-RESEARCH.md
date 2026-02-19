# Phase 3: Configurable Thresholds - Research

**Researched:** 2026-02-19
**Domain:** Chrome Extension settings pipeline, JavaScript validation patterns, inactivity timer wiring
**Confidence:** HIGH

## Summary

Phase 3 has three independent workstreams that share a single settings pipeline: (1) add an inactivityTimeout slider to the options page and wire it to replace two hardcoded `INACTIVITY_TIMEOUT = 120000` constants in sidebar.js and StateManager.js; (2) confirm and document that `duplicateWindow` is already wired to the WASM `analyze_chat_with_settings` call but verify the values are correct — research confirms it IS wired, so the work is just verification plus confirming the `options.html` slider range aligns with the WASM expectation; (3) harden all numeric validation in `options.js` and `ValidationHelpers.js` by replacing `typeof x !== 'number'` guards with `!Number.isFinite(x)` to correctly reject NaN inputs, and add the two settings that are in `options.js`/`sidebar.js` DEFAULT_SETTINGS but missing from `ValidationHelpers.validateSettings` (`sentimentSensitivity`, `moodUpgradeThreshold`).

The settings pipeline is well-established and identical to what was extended in Phase 1. The exact template for a new range slider (HTML + options.js wiring + DEFAULT_SETTINGS addition + chrome.storage.onChanged propagation) is already documented in the Phase 1 RESEARCH.md and implemented for `analysisWindowSize`. The inactivity timeout slider follows this template exactly.

The validation hardening is a global find-and-replace of one defensive pattern (`typeof x !== 'number'`) with a stronger one (`!Number.isFinite(x)`), plus adding validate-on-input event handling to options.js that disables the Save button when any field is invalid. No new CSS class is needed — the existing `.setting-warning` class is reused inline.

**Primary recommendation:** Do the three workstreams in order: (1) inactivityTimeout slider + wiring, (2) duplicateWindow verification, (3) validation hardening. Each is self-contained; the order reduces rework.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Inactivity Timeout UX
- Range slider control (consistent with analysis window slider)
- Range: 30-600 seconds, default 120s, step 30s
- Display raw seconds value (e.g., "120s") — not human-readable minutes
- Place in the existing settings section alongside other thresholds (not a new section)
- Change takes effect immediately on the running session timer — no restart required

#### Validation Behavior
- Prevent saving when any field has an invalid value — show inline error, disable save until corrected
- Harden ALL existing numeric fields retroactively with Number.isFinite(), not just new fields
- Validate in JS even for range sliders — defense in depth against programmatic manipulation
- Reuse existing `.setting-warning` class for validation error display — same style, no new CSS class

#### duplicateWindow Wiring
- Just fix the plumbing — no UI changes to the existing slider
- Change takes effect immediately on next analysis tick (consistent with analysis window behavior)
- inactivityTimeout also reads from settings immediately — both sidebar.js and SessionManager.js use live value

### Claude's Discretion
- Exact label and description text for inactivity timeout slider
- How to wire inactivityTimeout through SessionManager (replace hardcoded constant with settings read)
- Which WASM call site(s) need duplicateWindow passed through
- How to implement "prevent saving" — disable button vs block the save function
- Order of implementation (settings UI first vs wiring first)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THR-01 | Expose inactivity timeout setting (range 30-600s, default 120s, step 30) in options page and wire to SessionManager and sidebar inactivity detection | Fully supported. Two hardcoded `INACTIVITY_TIMEOUT = 120000` constants found: sidebar.js line 114 and StateManager.js line 53. The settings pipeline (chrome.storage.sync, onChanged listener, DEFAULT_SETTINGS spread) handles propagation automatically. Pattern identical to Phase 1 analysisWindowSize. |
| THR-02 | Fix duplicateWindow — pass `settings.duplicateWindow` to WASM `analyze_chat_with_settings()` call sites instead of hardcoded value | WIRING IS ALREADY DONE. sidebar.js lines 311 and 685 both pass `settings.duplicateWindow * 1000` to WASM. The "fix the plumbing" work is: verify the options.html slider range matches WASM expectations, confirm the settings onChanged handler propagates changes correctly, and add inactivityTimeout to DEFAULT_SETTINGS. No new call sites needed. |
| THR-03 | Harden all numeric threshold validation with `Number.isFinite()` replacing `typeof` checks in ValidationHelpers.js and options.js | Partially done. ValidationHelpers.js uses `typeof x !== 'number'` in 9 places. options.js does no validation — it uses bare `parseInt()` and passes results directly to storage without NaN checks. Two settings in options.js DEFAULT_SETTINGS (sentimentSensitivity, moodUpgradeThreshold) are entirely absent from ValidationHelpers.validateSettings. Both need to be added. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.storage.sync | MV3 built-in | Persist settings, propagate changes to sidebar | Already used for all settings in this codebase |
| HTML range input | HTML5 built-in | Slider control for inactivityTimeout | Already used for 6 other settings in options.html |
| Number.isFinite() | ECMAScript built-in | Reject NaN and Infinity in numeric validation | Strictly stronger than `typeof x === 'number'` — catches NaN which passes typeof |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.storage.onChanged | MV3 built-in | Live push of setting changes to sidebar without restart | Already wired in sidebar.js line 200; inactivityTimeout propagates automatically |
| HTMLButtonElement.disabled | DOM built-in | Prevent form submission when validation fails | Use on `#save-btn` to implement "prevent saving" decision |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Number.isFinite(x)` | `typeof x !== 'number' || isNaN(x)` | isFinite covers both cases in one call; user decision is Number.isFinite() specifically |
| disable save button | block `saveSettings()` internally | Disabling the button gives immediate visual feedback without running save logic at all |
| disable save button | show alert on submit | Inline error + disabled button is the decided approach; alerts are disruptive |

**Installation:** No new dependencies. All required APIs are browser built-ins already in use.

## Architecture Patterns

### Settings Pipeline (verified from source)

```
options.html slider   →   options.js (input/display/get/set)   →   chrome.storage.sync
                                                                           ↓
                                                               chrome.storage.onChanged
                                                                           ↓
                                                            sidebar.js (loadSettings + listener)
                                                                       settings var
                                                                           ↓
                                                              startInactivityCheck() reads
                                                              settings.inactivityTimeout * 1000
```

The live-update path for inactivityTimeout is: options page saves → storage.onChanged fires in sidebar → `settings` local var updates → next call to `startInactivityCheck()` uses new value. The running timer interval is reset each time a new message arrives (line 670 of sidebar.js calls `startInactivityCheck()` on every message batch), so the new timeout takes effect within one message-batch cycle.

### Pattern 1: Adding inactivityTimeout to Settings Pipeline

**What:** Extend DEFAULT_SETTINGS in three files, add HTML slider row, wire options.js, consume in sidebar.js and SessionManager.js.

**When to use:** This phase — THR-01.

**Three DEFAULT_SETTINGS copies that all need `inactivityTimeout: 120`:**
1. `extension/sidebar/sidebar.js` lines 13-23 — used by active processing path
2. `extension/sidebar/modules/StateManager.js` lines 271-278 — used by modular path
3. `extension/options/options.js` lines 3-11 — used by options page

Note: `sentimentSensitivity` and `moodUpgradeThreshold` are present in sidebar.js DEFAULT_SETTINGS (lines 19-20) but ABSENT from StateManager.js DEFAULT_SETTINGS (lines 271-278). This is an existing divergence — do not replicate it. Add `inactivityTimeout` to all three consistently.

**options.html slider row (follows analysis-window-size pattern):**
```html
<!-- Inside existing "Spam Detection" section, after duplicate-window row -->
<div class="setting-row">
  <label for="inactivity-timeout">
    <span class="setting-name">Inactivity timeout</span>
    <span class="setting-description">Seconds without new messages before showing "stream ended?" prompt</span>
  </label>
  <div class="input-group">
    <input type="range" id="inactivity-timeout" min="30" max="600" step="30" value="120">
    <span class="value-display" id="inactivity-timeout-value">120s</span>
  </div>
</div>
```

**options.js wiring additions:**
```javascript
// inputs object
inactivityTimeout: document.getElementById('inactivity-timeout'),

// displays object
inactivityTimeout: document.getElementById('inactivity-timeout-value'),

// updateDisplays
displays.inactivityTimeout.textContent = `${settings.inactivityTimeout}s`;

// setInputValues
inputs.inactivityTimeout.value = settings.inactivityTimeout;

// getInputValues
inactivityTimeout: parseInt(inputs.inactivityTimeout.value, 10),
```

### Pattern 2: Replacing Hardcoded INACTIVITY_TIMEOUT Constants

**sidebar.js** (line 114): `const INACTIVITY_TIMEOUT = 120000; // 2 minutes`
This constant is used on line 948: `if (timeSinceLastMessage >= INACTIVITY_TIMEOUT)`

Replace constant with live settings read:
```javascript
// Remove the const INACTIVITY_TIMEOUT = 120000 line.
// In startInactivityCheck(), change:
if (timeSinceLastMessage >= INACTIVITY_TIMEOUT) {
// To:
const inactivityMs = (settings.inactivityTimeout || 120) * 1000;
if (timeSinceLastMessage >= inactivityMs) {
```

**StateManager.js** (line 53): `this.INACTIVITY_TIMEOUT = 120000; // 2 minutes`
Used in SessionManager.js line 137: `if (timeSinceLastMessage >= stateManager.INACTIVITY_TIMEOUT)`

Two ways to wire it: (a) pass the settings value through to SessionManager when calling startInactivityCheck, or (b) have SessionManager read from stateManager.settings.inactivityTimeout. Option (b) is cleaner — StateManager already holds settings, and SessionManager already accesses `stateManager.state`:
```javascript
// In SessionManager.startInactivityCheck() (line 131-145),
// replace stateManager.INACTIVITY_TIMEOUT with:
const inactivityMs = (stateManager.settings.inactivityTimeout || 120) * 1000;
if (timeSinceLastMessage >= inactivityMs) {
```

And remove `this.INACTIVITY_TIMEOUT = 120000` from StateManager constructor, replacing it with the setting read-through.

### Pattern 3: duplicateWindow — Verification of Existing Wiring

**WASM call site 1** (sidebar.js line 307-312): main analysis in `processMessages()`:
```javascript
const result = wasmModule.analyze_chat_with_settings(
  messages,
  settings.topicMinCount,
  settings.spamThreshold,
  settings.duplicateWindow * 1000  // ← already wired, converts seconds to ms
);
```

**WASM call site 2** (sidebar.js line 681-686): batch sentiment accumulation in message listener:
```javascript
const batchResult = wasmModule.analyze_chat_with_settings(
  message.messages,
  settings.topicMinCount,
  settings.spamThreshold,
  settings.duplicateWindow * 1000  // ← already wired
);
```

Both call sites are already correct. The `duplicateWindow` options.html slider (line 69) has `min="10" max="120" step="5"`, but `ValidationHelpers.validateSettings` has `duplicateWindow` range as 5-300 seconds (line 120-121). The WASM `filter_spam_internal` accepts any positive f64 for `duplicate_window_ms`. No range mismatch causes a bug, but the validator allows 5-300 while the UI caps at 120 — this discrepancy is fine (validator is permissive, UI is restrictive).

THR-02 work: read both call sites, confirm `settings.duplicateWindow` is present and not hardcoded, document in SUMMARY that wiring was pre-existing.

### Pattern 4: Validation Hardening — Number.isFinite()

**The NaN problem:** `parseInt("", 10)` returns `NaN`. `typeof NaN === 'number'` is `true`. So the current guard `typeof x !== 'number'` in ValidationHelpers.js does NOT catch NaN. `Number.isFinite(NaN)` returns `false`, which is the correct rejection. `Number.isFinite(Infinity)` also returns `false` — a bonus.

**Current pattern (in ValidationHelpers.js):**
```javascript
if (typeof settings.topicMinCount !== 'number' || settings.topicMinCount < 1 || settings.topicMinCount > 100) {
```

**Replacement pattern:**
```javascript
if (!Number.isFinite(settings.topicMinCount) || settings.topicMinCount < 1 || settings.topicMinCount > 100) {
```

**All numeric fields in ValidationHelpers.validateSettings requiring replacement:**
- `settings.topicMinCount` — line 110
- `settings.spamThreshold` — line 115
- `settings.duplicateWindow` — line 120
- `settings.analysisWindowSize` — lines 126-130 (already uses `Number.isInteger` which also rejects NaN, but `typeof` check on line 126 should be hardened)
- Message fields: `msg.timestamp` (line 19), `bucket.count` (line 47), `topic.count` (line 72), sentiment fields (lines 89), `result.processed_count` (line 96) — these validate WASM output, not user input, but the decision says harden ALL numeric fields

**Missing from ValidationHelpers.validateSettings entirely:**
- `sentimentSensitivity` — in options.js DEFAULT_SETTINGS and sidebar.js DEFAULT_SETTINGS, has UI slider, but zero validation in ValidationHelpers
- `moodUpgradeThreshold` — same situation

Add validation for both:
```javascript
// Validate sentimentSensitivity (range 1-10 per options.html min/max)
if (!Number.isFinite(settings.sentimentSensitivity) || settings.sentimentSensitivity < 1 || settings.sentimentSensitivity > 10) {
  throw new Error('sentimentSensitivity must be a number between 1 and 10');
}

// Validate moodUpgradeThreshold (range 10-50 per options.html min/max)
if (!Number.isFinite(settings.moodUpgradeThreshold) || settings.moodUpgradeThreshold < 10 || settings.moodUpgradeThreshold > 50) {
  throw new Error('moodUpgradeThreshold must be a number between 10 and 50');
}
```

**Also missing from ValidationHelpers.validateSettings:**
- `inactivityTimeout` — add as part of THR-01:
```javascript
if (!Number.isFinite(settings.inactivityTimeout) || settings.inactivityTimeout < 30 || settings.inactivityTimeout > 600) {
  throw new Error('inactivityTimeout must be a number between 30 and 600 seconds');
}
```

### Pattern 5: Validate-on-Input in options.js (Prevent Saving)

The decided approach is to disable the Save button when any field has an invalid value, showing an inline `.setting-warning` message. The Save button has id `save-btn` (options.html line 123). Range sliders constrained by `min`/`max` attributes cannot produce out-of-range values through normal UI interaction, but programmatic assignment or DevTools manipulation can. The defense-in-depth check runs in the `input` event handler.

**Validation function in options.js:**
```javascript
function validateInputValues(values) {
  const errors = {};
  if (!Number.isFinite(values.topicMinCount) || values.topicMinCount < 1 || values.topicMinCount > 20) {
    errors.topicMinCount = 'Must be 1-20';
  }
  if (!Number.isFinite(values.spamThreshold) || values.spamThreshold < 1 || values.spamThreshold > 10) {
    errors.spamThreshold = 'Must be 1-10';
  }
  if (!Number.isFinite(values.duplicateWindow) || values.duplicateWindow < 10 || values.duplicateWindow > 120) {
    errors.duplicateWindow = 'Must be 10-120';
  }
  if (!Number.isFinite(values.sentimentSensitivity) || values.sentimentSensitivity < 1 || values.sentimentSensitivity > 10) {
    errors.sentimentSensitivity = 'Must be 1-10';
  }
  if (!Number.isFinite(values.moodUpgradeThreshold) || values.moodUpgradeThreshold < 10 || values.moodUpgradeThreshold > 50) {
    errors.moodUpgradeThreshold = 'Must be 10-50';
  }
  if (!Number.isFinite(values.analysisWindowSize) || values.analysisWindowSize < 50 || values.analysisWindowSize > 1000) {
    errors.analysisWindowSize = 'Must be 50-1000';
  }
  if (!Number.isFinite(values.inactivityTimeout) || values.inactivityTimeout < 30 || values.inactivityTimeout > 600) {
    errors.inactivityTimeout = 'Must be 30-600';
  }
  return errors;
}
```

**Wire into the existing input event handler (options.js lines 137-142):**
```javascript
Object.keys(inputs).forEach(key => {
  inputs[key].addEventListener('input', () => {
    const values = getInputValues();
    updateDisplays(values);
    const errors = validateInputValues(values);
    showValidationErrors(errors);
    document.getElementById('save-btn').disabled = Object.keys(errors).length > 0;
  });
});
```

**showValidationErrors function** — find or create a `.setting-warning` span adjacent to each input's `.input-group`, set its textContent to the error message (or empty string to clear):
```javascript
function showValidationErrors(errors) {
  // For each field, find its associated warning element and show/hide
  Object.keys(inputs).forEach(key => {
    const warningId = `${inputs[key].id}-warning`;
    let warningEl = document.getElementById(warningId);
    if (errors[key]) {
      if (!warningEl) {
        // Create inline warning element
        warningEl = document.createElement('span');
        warningEl.id = warningId;
        warningEl.className = 'setting-warning';
        inputs[key].closest('.input-group').appendChild(warningEl);
      }
      warningEl.textContent = errors[key];
      warningEl.classList.remove('hidden');
    } else if (warningEl) {
      warningEl.textContent = '';
      warningEl.classList.add('hidden');
    }
  });
}
```

### Anti-Patterns to Avoid

- **Calling `startInactivityCheck()` with a stale timeout:** The timer is reset on every message batch (sidebar.js line 670). Since the settings variable is a module-level object updated by onChanged, the next timer reset automatically picks up the new timeout value. No explicit "restart timer on settings change" is needed.
- **Only hardening ValidationHelpers and not options.js:** The decision requires both. options.js currently has zero NaN guards; it passes parseInt results directly to storage.
- **Adding a new CSS class for validation errors:** The decision says reuse `.setting-warning`. Check that class exists in options.css before referencing it — it does (line 313).
- **Modifying the WASM Rust code:** THR-02 is confirmed as a JS-only fix. The WASM function `analyze_chat_with_settings` already accepts `duplicate_window_ms: f64` and the JS side already passes `settings.duplicateWindow * 1000`. No Rust changes are needed.
- **Forgetting the `* 1000` conversion:** `settings.inactivityTimeout` stores seconds (120). The comparison in sidebar.js uses `Date.now()` which returns milliseconds. Must convert: `settings.inactivityTimeout * 1000`. Same pattern as `settings.duplicateWindow * 1000` already in the codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom storage layer | chrome.storage.sync | Already in use; handles sync, persistence, events |
| Live setting propagation | Polling loop | chrome.storage.onChanged | Already wired in sidebar.js; fires automatically |
| NaN detection | Custom type checker | Number.isFinite() | Standard built-in, handles NaN and Infinity |
| Inline validation display | New CSS component | `.setting-warning` class | Already styled, already used for analysis-window warning |
| Timer restart on settings change | Explicit event dispatch | Natural timer reset on next message batch | startInactivityCheck() is called every message batch; new settings take effect on next call |

**Key insight:** The "prevent saving" feature is two lines: call `validateInputValues()` in the input handler, and set `saveBtn.disabled = hasErrors`. The validation logic is duplicated between options.js (input-time) and ValidationHelpers.js (storage-time), but this redundancy is the point — defense in depth.

## Common Pitfalls

### Pitfall 1: NaN Passes typeof but Fails Number.isFinite
**What goes wrong:** `parseInt("", 10)` yields `NaN`. `typeof NaN === 'number'` returns `true`. The current `typeof settings.x !== 'number'` guard in ValidationHelpers.js will NOT catch this. A user who clears a field and saves will write NaN to chrome.storage, which will then be used as a timer value (`NaN * 1000 === NaN`) causing the inactivity timer to never fire.
**Why it happens:** The typeof check is insufficient for NaN rejection.
**How to avoid:** Replace every `typeof x !== 'number'` in ValidationHelpers.js with `!Number.isFinite(x)`.
**Warning signs:** Clearing an options field and saving causes the sidebar to behave as if the setting has no limit.

### Pitfall 2: INACTIVITY_TIMEOUT Has Two Independent Copies
**What goes wrong:** Replacing the constant in sidebar.js but forgetting StateManager.js (or vice versa). SessionManager.js uses `stateManager.INACTIVITY_TIMEOUT` (line 137) — this is the StateManager copy. sidebar.js's `startInactivityCheck()` function uses its own local `INACTIVITY_TIMEOUT` constant (line 948). These are independent code paths that both trigger the "stream ended?" prompt.
**Why it happens:** sidebar.js and SessionManager.js/StateManager.js are parallel implementations of the same feature.
**How to avoid:** Both must read from the live settings value. Test by changing the slider to 30s, waiting 35 seconds without messages, and verifying the prompt appears.
**Warning signs:** Prompt fires after 2 minutes regardless of the slider setting.

### Pitfall 3: options.js Validates Different Ranges Than ValidationHelpers.js
**What goes wrong:** options.js slider HTML has `min="10" max="120"` for duplicateWindow, but ValidationHelpers.js allows 5-300. Adding validation to options.js that mirrors the HTML range (10-120) is correct for the UI. The ValidationHelpers range (5-300) is intentionally permissive for programmatic use. Keep them distinct — do not "fix" ValidationHelpers to match the UI range.
**Why it happens:** The UI constrains what users can do; ValidationHelpers constrains what code can store.
**How to avoid:** options.js validate() uses HTML-range bounds. ValidationHelpers.validateSettings() uses wider programmatic bounds. Document this distinction.
**Warning signs:** options.js validation rejects values that are valid programmatically, breaking tests.

### Pitfall 4: Save Button Disabled State Not Initialized
**What goes wrong:** The `save-btn.disabled = hasErrors` logic only runs on `input` events. If the page loads with invalid stored data (e.g., pre-existing NaN in storage), the save button starts enabled and the user can re-save the bad data without triggering validation.
**Why it happens:** Initial load calls `setInputValues()` which populates inputs from storage, but never runs validation.
**How to avoid:** Call `validateInputValues()` and update button state once at the end of `loadSettings()`.
**Warning signs:** Loading the page with a corrupt settings object and saving without touching any field succeeds silently.

### Pitfall 5: inactivityTimeout Not in All Three DEFAULT_SETTINGS
**What goes wrong:** Adding `inactivityTimeout: 120` to options.js DEFAULT_SETTINGS but forgetting sidebar.js or StateManager.js. If sidebar.js DEFAULT_SETTINGS lacks the key, `settings.inactivityTimeout` is `undefined`, `undefined * 1000 === NaN`, and the check `timeSinceLastMessage >= NaN` is always `false` — the timer never fires.
**Why it happens:** Three independent DEFAULT_SETTINGS objects across three files.
**How to avoid:** Treat all three updates as a single atomic task. Verify by searching for `DEFAULT_SETTINGS` after the change.
**Warning signs:** The inactivity prompt never appears after adding the slider.

### Pitfall 6: Timer Does Not Reset Immediately on Slider Change
**What goes wrong:** User sets timeout to 30s. The current interval is still checking against the old 120s timeout until the next message resets the interval. If no messages arrive, the old timer ticks for up to 10 seconds (the interval check frequency) before the first message triggers a reset with the new value.
**Why it happens:** `startInactivityCheck()` is called on each message batch, not on settings change.
**What this is:** This is ACCEPTABLE behavior per the decision: "change takes effect immediately on the running session timer." In practice it means "takes effect on the next message batch," which is within the 10-second check interval. Not a bug to fix, but document it in the task notes.

## Code Examples

Verified patterns from codebase source:

### Current Hardcoded Constants to Replace (THR-01)

```javascript
// sidebar.js line 114 — to be removed
const INACTIVITY_TIMEOUT = 120000; // 2 minutes

// sidebar.js line 948 — uses the constant
if (timeSinceLastMessage >= INACTIVITY_TIMEOUT) {

// StateManager.js line 53 — to be replaced with settings read-through
this.INACTIVITY_TIMEOUT = 120000; // 2 minutes

// SessionManager.js line 137 — uses stateManager.INACTIVITY_TIMEOUT
if (timeSinceLastMessage >= stateManager.INACTIVITY_TIMEOUT) {
```

### Replacement in sidebar.js startInactivityCheck()

```javascript
// Source: extension/sidebar/sidebar.js lines 939-954 (verified)
function startInactivityCheck() {
  if (inactivityCheckInterval) {
    clearInterval(inactivityCheckInterval);
  }
  inactivityCheckInterval = setInterval(() => {
    if (lastMessageTime && sessionStartTime) {
      const timeSinceLastMessage = Date.now() - lastMessageTime;
      // Changed: use live settings value, convert seconds to ms, fallback to 120s
      const inactivityMs = (settings.inactivityTimeout || 120) * 1000;
      if (timeSinceLastMessage >= inactivityMs) {
        showStreamEndedPrompt();
        stopInactivityCheck();
      }
    }
  }, 10000);
}
```

### Replacement in SessionManager.js startInactivityCheck()

```javascript
// Source: extension/sidebar/modules/SessionManager.js lines 128-145 (verified)
startInactivityCheck() {
  this.stopInactivityCheck();
  const intervalId = setInterval(() => {
    const lastMessageTime = stateManager.state.lastMessageTime;
    const sessionStartTime = stateManager.state.sessionStartTime;
    if (lastMessageTime && sessionStartTime) {
      const timeSinceLastMessage = Date.now() - lastMessageTime;
      // Changed: read from live settings, remove stateManager.INACTIVITY_TIMEOUT
      const inactivityMs = (stateManager.settings.inactivityTimeout || 120) * 1000;
      if (timeSinceLastMessage >= inactivityMs) {
        this.showStreamEndedPrompt();
        this.stopInactivityCheck();
      }
    }
  }, 10000);
  stateManager.setInactivityCheckInterval(intervalId);
}
```

### duplicateWindow Call Sites (THR-02 — already wired, shown for verification)

```javascript
// Source: sidebar.js line 307-312 (verified — already correct)
const result = wasmModule.analyze_chat_with_settings(
  messages,
  settings.topicMinCount,
  settings.spamThreshold,
  settings.duplicateWindow * 1000  // converts seconds to ms for WASM
);

// Source: sidebar.js line 681-686 (verified — already correct)
const batchResult = wasmModule.analyze_chat_with_settings(
  message.messages,
  settings.topicMinCount,
  settings.spamThreshold,
  settings.duplicateWindow * 1000
);
```

### Number.isFinite() Replacement (THR-03)

```javascript
// Before (ValidationHelpers.js pattern, e.g., line 110):
if (typeof settings.topicMinCount !== 'number' || settings.topicMinCount < 1 || settings.topicMinCount > 100) {
  throw new Error('topicMinCount must be a number between 1 and 100');
}

// After:
if (!Number.isFinite(settings.topicMinCount) || settings.topicMinCount < 1 || settings.topicMinCount > 100) {
  throw new Error('topicMinCount must be a number between 1 and 100');
}
```

Key behavior difference:
```javascript
typeof NaN === 'number'         // true  — FAILS to reject NaN (bug)
Number.isFinite(NaN)            // false — correctly rejects NaN (fix)
Number.isFinite(Infinity)       // false — also rejects Infinity (bonus)
Number.isFinite(42)             // true  — correctly accepts valid number
```

### options.js — Validation at Save Time (defense in depth)

```javascript
// Modified saveSettings() in options.js
async function saveSettings() {
  try {
    const values = getInputValues();
    const errors = validateInputValues(values);
    if (Object.keys(errors).length > 0) {
      showStatus('Fix validation errors before saving', 'error');
      return; // Belt-and-suspenders: button should already be disabled
    }
    await chrome.storage.sync.set({ settings: values });
    showStatus('Settings saved!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `INACTIVITY_TIMEOUT = 120000` | User-configurable `inactivityTimeout` from settings | This phase | Prevents false "stream ended?" prompts during ad breaks |
| `typeof x !== 'number'` NaN guard | `Number.isFinite(x)` | This phase | Correctly rejects NaN written to storage |
| No save-time validation in options.js | Validate on input, disable save on error | This phase | Prevents invalid settings from reaching storage |

**No deprecated patterns introduced.** All patterns are current Chrome MV3 best practice.

## Open Questions

1. **Where to place the inactivityTimeout slider in options.html?**
   - What we know: "Place in the existing settings section alongside other thresholds" — not a new section.
   - What's unclear: Which existing section? "Spam Detection" (alongside duplicateWindow) or a new "Session" grouping?
   - Recommendation (Claude's discretion): Place in "Spam Detection" section, after the `duplicate-window` row. Both thresholds relate to time windows and chat activity. This keeps all time-based settings together without creating a new section.

2. **How should StateManager.js handle the INACTIVITY_TIMEOUT removal?**
   - What we know: `stateManager.INACTIVITY_TIMEOUT` is a property accessed by SessionManager.js line 137.
   - What's unclear: Remove the property and update SessionManager to read from `stateManager.settings.inactivityTimeout` directly, or keep the property as a computed getter?
   - Recommendation (Claude's discretion): Remove `this.INACTIVITY_TIMEOUT = 120000` from the constructor. Update SessionManager.js to read `(stateManager.settings.inactivityTimeout || 120) * 1000` directly. Simpler, no property to maintain.

3. **Should `validateSettings()` in ValidationHelpers.js treat `inactivityTimeout` as optional (undefined guard) like `analysisWindowSize`?**
   - What we know: `analysisWindowSize` has an `if (settings.analysisWindowSize !== undefined)` guard (line 125). This tolerates legacy settings objects from before Phase 1.
   - What's unclear: Should inactivityTimeout use the same pattern?
   - Recommendation: Yes, add the same undefined guard. This tolerates settings objects saved before Phase 3, allowing them to load without validation failure.

## Sources

### Primary (HIGH confidence)
- `extension/sidebar/sidebar.js` — full file read; verified INACTIVITY_TIMEOUT constant (line 114), startInactivityCheck() function (lines 939-954), both analyze_chat_with_settings call sites (lines 307-312, 681-686), DEFAULT_SETTINGS (lines 13-23), settings onChanged listener (line 200)
- `extension/sidebar/modules/SessionManager.js` — full file read; verified stateManager.INACTIVITY_TIMEOUT usage (line 137), startInactivityCheck() function (lines 128-145)
- `extension/sidebar/modules/StateManager.js` — full file read; verified INACTIVITY_TIMEOUT constant (line 53), DEFAULT_SETTINGS (lines 271-278), settings getter (line 60)
- `extension/sidebar/utils/ValidationHelpers.js` — full file read; verified all typeof number checks (9 locations), confirmed sentimentSensitivity and moodUpgradeThreshold are absent from validateSettings()
- `extension/options/options.js` — full file read; verified all parseInt() calls (lines 78-85), no NaN guards, DEFAULT_SETTINGS (lines 3-11), slider event handler (lines 137-142)
- `extension/options/options.html` — full file read; verified slider HTML patterns, existing sections, `.setting-warning` usage (line 36), #save-btn (line 123)
- `extension/options/options.css` — full file read; verified `.setting-warning` class (line 313)
- `wasm-engine/src/lib.rs` — full file read; verified `analyze_chat_with_settings` signature accepts `duplicate_window_ms: f64` (line 543)

### Secondary (MEDIUM confidence)
- Phase 1 RESEARCH.md — verified settings pipeline architecture; inactivityTimeout follows identical pattern to analysisWindowSize

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns directly verified from source
- Architecture: HIGH — both INACTIVITY_TIMEOUT constants located; both duplicateWindow call sites verified; all typeof checks enumerated
- Pitfalls: HIGH — NaN/typeof behavior is a JavaScript language fact; verified from source that sentimentSensitivity and moodUpgradeThreshold are absent from ValidationHelpers

**Research date:** 2026-02-19
**Valid until:** Stable — pure JavaScript/HTML; no external dependencies to track
