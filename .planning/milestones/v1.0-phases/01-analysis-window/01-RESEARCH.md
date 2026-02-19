# Phase 1: Analysis Window - Research

**Researched:** 2026-02-19
**Domain:** Chrome Extension settings wiring, JavaScript UI patterns, chrome.storage API
**Confidence:** HIGH

## Summary

This phase is entirely internal to the extension codebase — no new external dependencies, no WASM changes. The work is threefold: (1) update a constant in three JavaScript files, (2) add one new range slider to the options page HTML and wire it into the existing settings pipeline, and (3) render a message count indicator in the sidebar. All patterns already exist in the codebase and need only to be extended.

The settings plumbing is fully established. `chrome.storage.sync` stores a `settings` object. `options.js` writes it, `sidebar.js` reads it at load and via `chrome.storage.onChanged`, and `StateManager.js` holds the in-memory copy. Adding `analysisWindowSize` to this pipeline follows an exact template already in use for five other settings (topicMinCount, spamThreshold, duplicateWindow, sentimentSensitivity, moodUpgradeThreshold).

The key insight about "existing users auto-upgrade to 500": the existing `loadSettings` pattern in all three files does `{ ...DEFAULT_SETTINGS, ...result.settings }`. If a stored settings object has no `analysisWindowSize` key (which it won't for existing users), the spread leaves the DEFAULT_SETTINGS value of 500 in place. No migration code is needed — the spread pattern handles it automatically.

**Primary recommendation:** Follow the exact pattern of the existing range sliders. Add `analysisWindowSize` to DEFAULT_SETTINGS in all three files, add a `<input type="range">` in options.html, wire it in options.js, consume it from `settings.analysisWindowSize` in sidebar.js, and replace the two hardcoded `MAX_MESSAGES = 100` constants with reads from settings.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Settings UI Control
- Range slider control (not dropdown or number input)
- Show contextual time estimate alongside value (e.g. "500 messages ~ 25 seconds of busy chat")
- Friendly label — "Messages to analyze" or similar, not "MAX_MESSAGES"
- Place in existing settings section alongside topic/sentiment settings (not a new section)
- Step size of 100 (100, 200, 300... 1000 — 10 stops)

#### Default & Range Behavior
- Default: 500 (up from 100)
- Range: 50 to 1000
- Existing users auto-upgrade to 500 on extension update (don't preserve old 100 default)
- No warning at high values — WASM handles it fine
- At minimum (50): show subtle warning that topics/sentiment may be less accurate
- All three DEFAULT_SETTINGS copies (sidebar.js, StateManager.js, options.js) must be updated atomically

#### Live Update Behavior
- Change takes effect immediately on next 5-second analysis tick
- Keep all accumulated messages in buffer — next analysis just slices to new window size
- Existing topics/sentiment blend smoothly (no reset) when window size changes mid-stream
- Show subtle message count status in sidebar (e.g. "423/500 messages") during live sessions

### Claude's Discretion
- Exact placement of message count indicator in sidebar layout
- Time estimate calculation formula (can be approximate based on typical chat velocity)
- How to detect and handle the auto-upgrade from old 100 default for existing users
- Exact wording of low-value warning text

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIN-01 | Add analysis window size setting (range 50-1000, default 500, step 50) to options page and wire to StateManager MAX_MESSAGES across all accumulation paths | Fully supported — the existing settings pipeline (chrome.storage.sync, DEFAULT_SETTINGS spread, onChanged listener) handles this without new patterns. Two `MAX_MESSAGES` usages in sidebar.js and one `this.MAX_MESSAGES` in StateManager.js are the full set of accumulation paths. Step size is 50 per requirement but user decided step 100 in CONTEXT.md — CONTEXT.md takes precedence. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.storage.sync | MV3 built-in | Persist settings across browser restarts, sync across devices | Already used for all settings in this codebase |
| HTML range input | HTML5 built-in | Slider control | Already used for 4 other settings in options.html |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.storage.onChanged | MV3 built-in | Live push of setting changes to sidebar | Already wired — sidebar.js listens at line 197 for all settings changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| range slider | number input | User decided range slider — more intuitive for bounded numeric values |
| range slider | dropdown | User decided range slider — avoids enumerating 10 options in HTML |

**Installation:** No new dependencies. All required APIs are browser-built-ins already in use.

## Architecture Patterns

### Current Settings Pipeline (verified from source)

```
options.html   →   options.js   →   chrome.storage.sync
                                          ↓
                                   chrome.storage.onChanged
                                          ↓
                              sidebar.js (loadSettings + onChanged listener)
                                          ↓
                                    settings local var
                                          ↓
                               StateManager.settings (separate copy)
```

Note: sidebar.js has its own `settings` local variable AND `StateManager.js` has its own `DEFAULT_SETTINGS` and in-memory settings. These are currently NOT the same object — sidebar.js manages its own copy and the StateManager module manages its own. The "three copies" are:
1. `extension/sidebar/sidebar.js` lines 13-20: `const DEFAULT_SETTINGS = {...}`
2. `extension/sidebar/modules/StateManager.js` lines 267-273: `const DEFAULT_SETTINGS = {...}`
3. `extension/options/options.js` lines 3-10: `const DEFAULT_SETTINGS = {...}`

### Pattern 1: Adding a New Setting (exact template from codebase)

**What:** Every setting requires parallel changes in 4 locations: DEFAULT_SETTINGS (×3 files), options.html (slider row), options.js (input/display/get/set), sidebar.js (consume from settings object).

**When to use:** This phase — add `analysisWindowSize`.

**Example — how topicMinCount is done (verified from source):**

options.html:
```html
<div class="setting-row">
  <label for="topic-min-count">
    <span class="setting-name">Minimum mentions</span>
    <span class="setting-description">Words must appear this many times to show as trending</span>
  </label>
  <div class="input-group">
    <input type="range" id="topic-min-count" min="1" max="20" value="5">
    <span class="value-display" id="topic-min-count-value">5</span>
  </div>
</div>
```

options.js wiring:
```javascript
const inputs = {
  topicMinCount: document.getElementById('topic-min-count'),
  // ...
};
const displays = {
  topicMinCount: document.getElementById('topic-min-count-value'),
  // ...
};
function updateDisplays(settings) {
  displays.topicMinCount.textContent = settings.topicMinCount;
  // ...
}
function setInputValues(settings) {
  inputs.topicMinCount.value = settings.topicMinCount;
  // ...
}
function getInputValues() {
  return {
    topicMinCount: parseInt(inputs.topicMinCount.value, 10),
    // ...
  };
}
```

sidebar.js consuming the setting:
```javascript
const result = wasmModule.analyze_chat_with_settings(
  messages,
  settings.topicMinCount,  // ← consumed here
  settings.spamThreshold,
  settings.duplicateWindow * 1000
);
```

### Pattern 2: MAX_MESSAGES Usage (two accumulation paths in sidebar.js)

Both paths must change from hardcoded 100 to `settings.analysisWindowSize` (or the StateManager equivalent):

**Path A — message listener (sidebar.js line 726):**
```javascript
// Add new messages to accumulator
allMessages.push(...message.messages);
// Keep only recent messages
if (allMessages.length > MAX_MESSAGES) {
  allMessages = allMessages.slice(-MAX_MESSAGES);
}
```

**Path B — StateManager.addMessage (StateManager.js line 157-159):**
```javascript
addMessage(message) {
  this.state.allMessages.push(message);
  this.state.lastMessageTime = Date.now();
  // Keep only the last MAX_MESSAGES for processing
  if (this.state.allMessages.length > this.MAX_MESSAGES) {
    this.state.allMessages = this.state.allMessages.slice(-this.MAX_MESSAGES);
  }
  this.state.totalMessageCount++;
}
```

Note: sidebar.js and StateManager.js maintain separate message buffers currently. The sidebar.js `allMessages` array at the module level (line 680) is the active accumulation path used in production. StateManager.js has its own buffer but sidebar.js's `chrome.runtime.onMessage` handler (line 684) calls `processMessages(allMessages)` directly — not via StateManager. Both paths need to be updated.

### Pattern 3: Auto-Upgrade for Existing Users (no migration needed)

The existing spread pattern in `loadSettings`:
```javascript
// From sidebar.js line 186 and options.js line 72
const settings = { ...DEFAULT_SETTINGS, ...result.settings };
```

If `result.settings` has no `analysisWindowSize` key (existing users), the spread leaves the DEFAULT_SETTINGS value (500) in place. No migration code needed. This is the same mechanism that handles any new setting addition.

### Pattern 4: Low-Value Warning Display

At slider value ≤ 50 (the minimum), display a subtle inline warning near the slider. The options.css already has `.setting-description` styled as muted small text — a conditional warning message can be appended or toggled via JavaScript in the `input` event listener.

Alternatively, the warning can be a `<span>` that shows/hides based on the current value:
```javascript
// In options.js input event handler
inputs.analysisWindowSize.addEventListener('input', () => {
  const val = parseInt(inputs.analysisWindowSize.value, 10);
  warningEl.classList.toggle('hidden', val > 50);
  // update time estimate display
});
```

### Pattern 5: Message Count Indicator in Sidebar

The `#stats` div in sidebar.html currently shows:
```html
<div id="stats" class="stats hidden">
  <span id="processed-count">0</span> messages processed
</div>
```

The `processedCount` DOM element is updated in sidebar.js `processMessages()` with `processedCount.textContent = totalMessageCount`. The message count status ("423/500 messages") should appear in the same stats area or just below it.

Recommended placement (Claude's discretion): augment the existing `#stats` div to show both total session messages and the current window size. This keeps related information co-located.

Candidate HTML addition to sidebar.html:
```html
<div id="stats" class="stats hidden">
  <span id="processed-count">0</span> messages processed
  <span id="window-count" class="window-count hidden">
    (<span id="window-current">0</span>/<span id="window-max">500</span> in window)
  </span>
</div>
```

### Pattern 6: Time Estimate Display (Claude's discretion)

Contextual time estimate for the slider value. Formula based on typical chat velocity.

Reasonable estimates for typical busy stream:
- Busy chat: ~20 messages/second (fast Twitch)
- Active chat: ~4 messages/second (YouTube/normal Twitch)
- A "middle ground" of ~3-4 messages/second is appropriate for the estimate

Recommended formula (approximate, not precise):
```javascript
function getTimeEstimate(msgCount) {
  const messagesPerSecond = 3; // ~3 msgs/sec for active chat
  const seconds = Math.round(msgCount / messagesPerSecond);
  if (seconds < 60) return `~${seconds}s of active chat`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes}m of active chat`;
}
// 50 msgs  → ~17s of active chat
// 100 msgs → ~33s of active chat
// 500 msgs → ~2m of active chat
// 1000 msgs → ~5m of active chat
```

This estimate is displayed inline next to the value display in options.html, not in the sidebar.

### Anti-Patterns to Avoid
- **Resetting allMessages on window size change:** The decision is to keep all accumulated messages; next analysis slices to new window. Do NOT clear the buffer.
- **Adding analysisWindowSize to only one DEFAULT_SETTINGS copy:** All three files must be updated in the same commit.
- **Hardcoding a cap on ValidationHelpers.js without updating it:** The `validateSettings` function in `ValidationHelpers.js` will need `analysisWindowSize` validation added (range: 50-1000, integer). Otherwise valid saves from the options page may fail validation in StateManager.
- **Using innerHTML for the warning text:** Codebase convention is to use textContent or safe DOM helpers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom localStorage wrapper | chrome.storage.sync | Already used, handles sync/restore automatically |
| Live settings update | Polling for changes | chrome.storage.onChanged | Already wired in sidebar.js line 197 |
| Slider value display | Custom slider component | `<input type="range">` + value display span | Already done for 4 other sliders |
| Auto-upgrade migration | Version-tagged migration runner | Spread defaults: `{ ...DEFAULT_SETTINGS, ...result.settings }` | Pattern already in place, handles any missing key |

**Key insight:** Every mechanism needed already exists. This phase is purely additive — extend, don't replace.

## Common Pitfalls

### Pitfall 1: DEFAULT_SETTINGS Divergence
**What goes wrong:** Updating one or two of the three copies, leaving one at `{}` without `analysisWindowSize`.
**Why it happens:** The three files are independent modules, easy to miss one.
**How to avoid:** Update all three in the same commit. The planning tasks should treat them as one atomic unit.
**Warning signs:** Options page shows correct default but sidebar resets to an unexpected value.

### Pitfall 2: ValidationHelpers Not Updated
**What goes wrong:** `validateSettings()` in `ValidationHelpers.js` doesn't know about `analysisWindowSize`. If it performs strict validation on the settings object, it will either silently ignore the new key or reject it.
**Why it happens:** ValidationHelpers is separate from DEFAULT_SETTINGS; easy to forget.
**How to avoid:** Read the full `validateSettings()` function (verified above, lines 104-133) — it validates specific fields by name. `analysisWindowSize` is not currently validated, so it won't be rejected, but it should be added for correctness.
**Warning signs:** No warning from current code — but future validation hardening would break without it.

### Pitfall 3: Step Size Mismatch Between Spec and Implementation
**What goes wrong:** The phase requirement says step 50, the CONTEXT.md decisions say step 100.
**Why it happens:** Two sources with different values.
**How to avoid:** CONTEXT.md wins (user decisions). Use step 100 in the HTML `<input type="range" step="100">`. The range is 50-1000 with step 100, meaning stops at: 50, 100 (note: with min=50 and step=100, stops are 50, 150, 250... which is odd). To get clean 100-step stops: set min=100, but user said minimum is 50. Resolution: use step=50 to allow 50 as a special minimum, and the warning triggers at 50. Or set min=50, step=50 to get 50, 100, 150... 1000 (19 stops). Decision is Claude's discretion given the locked min of 50.

The CONTEXT.md says "Step size of 100 (100, 200, 300... 1000 — 10 stops)" and separately "Range: 50 to 1000" with "At minimum (50): show subtle warning". These are slightly inconsistent — 10 stops of 100 from 100 to 1000, plus a special minimum of 50. Recommend: step=50 to permit 50 as a valid stop, with the warning triggered at ≤50. This gives stops: 50, 100, 150, 200... but the "10 stops" language implies step=100. Safest interpretation: step=100, min=100, but add 50 as a special "minimum" via a separate checkbox or by setting min=50 with step=50. The cleanest implementation that satisfies both constraints: `min="50" max="1000" step="50"` giving 20 stops including 50.

### Pitfall 4: allMessages Trim Timing
**What goes wrong:** When the user reduces the window from 500 to 200, messages 201-500 are not dropped immediately from `allMessages`. The trim only happens when new messages arrive (at the `push` point).
**Why it happens:** The trim is inside the `push` path, not on settings change.
**How to avoid:** This is the correct behavior per the decision: "Keep all accumulated messages in buffer — next analysis just slices to new window size." However, the `processMessages(allMessages)` call in sidebar.js passes the full `allMessages` array. The WASM function itself must receive the sliced window, not the full buffer. The slice must happen at the call site:
```javascript
// Correct: pass last N messages to WASM, but keep full buffer
const windowMessages = allMessages.slice(-settings.analysisWindowSize);
processMessages(windowMessages);
```
The buffer stays large; only the WASM call is windowed.

### Pitfall 5: StateManager.MAX_MESSAGES Not Used in Active Path
**What goes wrong:** StateManager.addMessage trims to `this.MAX_MESSAGES`, but sidebar.js's active message path doesn't use StateManager — it uses the module-level `allMessages` array directly. Updating only StateManager.MAX_MESSAGES would have no effect on actual behavior.
**Why it happens:** The codebase has StateManager as a newer modular layer that's not yet fully wired to sidebar.js. sidebar.js still uses module-level variables.
**How to avoid:** Update both: the module-level `MAX_MESSAGES` constant in sidebar.js AND `this.MAX_MESSAGES` in StateManager. Both should derive from `settings.analysisWindowSize` after settings load.
**Warning signs:** Behavior changes correctly in sidebar but not in tests that exercise StateManager.

### Pitfall 6: options.js chrome.storage.sync — immediate vs. deferred
**What goes wrong:** Expecting options.js saves to immediately update the sidebar without a page reload.
**Why it happens:** sidebar.js uses `chrome.storage.onChanged` which fires synchronously when storage changes. This IS already wired. The live update path is: options.js saves → storage.onChanged fires in sidebar → settings local var updated → next 5-second batch uses new window size.
**How to avoid:** No code change needed here — the mechanism already works. The 5-second analysis tick means the change takes effect within 5 seconds, satisfying the "immediately on next tick" requirement.

## Code Examples

Verified patterns from codebase source:

### Adding to DEFAULT_SETTINGS (all three locations)
```javascript
// File: extension/sidebar/sidebar.js (line 13)
// File: extension/sidebar/modules/StateManager.js (line 267)
// File: extension/options/options.js (line 3)
// ADD to each:
const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  sentimentSensitivity: 3,
  moodUpgradeThreshold: 30,
  aiSummariesEnabled: false,
  analysisWindowSize: 500  // NEW
};
```

### options.html slider row (follows existing pattern)
```html
<!-- Add inside existing "Topic Detection" section or a fitting section -->
<div class="setting-row">
  <label for="analysis-window-size">
    <span class="setting-name">Messages to analyze</span>
    <span class="setting-description">How many recent messages the engine sees per analysis pass</span>
    <span id="analysis-window-warning" class="setting-warning hidden">
      At low values, topics and sentiment may be less accurate
    </span>
  </label>
  <div class="input-group">
    <input type="range" id="analysis-window-size" min="50" max="1000" step="50" value="500">
    <span class="value-display" id="analysis-window-size-value">500</span>
    <span class="value-estimate" id="analysis-window-size-estimate">~2m of active chat</span>
  </div>
</div>
```

### options.js additions
```javascript
// In inputs object:
analysisWindowSize: document.getElementById('analysis-window-size'),

// In displays object:
analysisWindowSize: document.getElementById('analysis-window-size-value'),

// In updateDisplays:
displays.analysisWindowSize.textContent = settings.analysisWindowSize;
// Update time estimate:
const estimate = getTimeEstimate(settings.analysisWindowSize);
document.getElementById('analysis-window-size-estimate').textContent = estimate;
// Show/hide low-value warning:
document.getElementById('analysis-window-warning').classList.toggle('hidden', settings.analysisWindowSize > 50);

// In setInputValues:
inputs.analysisWindowSize.value = settings.analysisWindowSize;

// In getInputValues:
analysisWindowSize: parseInt(inputs.analysisWindowSize.value, 10),

// New helper:
function getTimeEstimate(msgCount) {
  const msgsPerSec = 3;
  const seconds = Math.round(msgCount / msgsPerSec);
  if (seconds < 60) return `~${seconds}s of active chat`;
  return `~${Math.round(seconds / 60)}m of active chat`;
}
```

### sidebar.js: use settings.analysisWindowSize in message listener
```javascript
// Before (line 681, 726-727):
const MAX_MESSAGES = 100;
// ...
allMessages.push(...message.messages);
if (allMessages.length > MAX_MESSAGES) {
  allMessages = allMessages.slice(-MAX_MESSAGES);
}
processMessages(allMessages);

// After:
// Remove MAX_MESSAGES constant.
// allMessages buffer grows unbounded until settings are loaded.
// Slice at the call site:
allMessages.push(...message.messages);
// Trim buffer to 2x window to avoid unbounded growth:
const windowSize = settings.analysisWindowSize || 500;
if (allMessages.length > windowSize * 2) {
  allMessages = allMessages.slice(-windowSize * 2);
}
// Pass only the analysis window to WASM:
const windowMessages = allMessages.slice(-windowSize);
processMessages(windowMessages);
```

Note: keeping the buffer at 2× the window size allows smooth behavior when the user increases the window — messages already seen are still in the buffer up to that cap. A 2× cap (max 2000 messages) is reasonable for memory.

### StateManager.js: update MAX_MESSAGES
```javascript
// In constructor, change:
this.MAX_MESSAGES = 100;
// To use the default, update after settings load:
this.MAX_MESSAGES = 500;
// And add a method to update it:
setMaxMessages(n) {
  this.MAX_MESSAGES = Math.max(50, Math.min(1000, parseInt(n, 10)));
}
```

### Message count indicator in sidebar.html
```html
<!-- Modify the existing #stats div -->
<div id="stats" class="stats hidden">
  <span id="processed-count">0</span> messages total
  <span class="stats-separator"> · </span>
  <span id="window-stats" class="window-stats">
    <span id="window-current">0</span>/<span id="window-max">500</span> in window
  </span>
</div>
```

### sidebar.js: update window stats display
```javascript
// In processMessages(), after setting processedCount:
processedCount.textContent = totalMessageCount;
const windowCurrentEl = document.getElementById('window-current');
const windowMaxEl = document.getElementById('window-max');
if (windowCurrentEl) windowCurrentEl.textContent = messages.length; // messages is already the sliced window
if (windowMaxEl) windowMaxEl.textContent = settings.analysisWindowSize;
```

### ValidationHelpers.js: add analysisWindowSize validation
```javascript
// In validateSettings(), add:
if (settings.analysisWindowSize !== undefined) {
  if (typeof settings.analysisWindowSize !== 'number' ||
      settings.analysisWindowSize < 50 ||
      settings.analysisWindowSize > 1000) {
    throw new Error('analysisWindowSize must be a number between 50 and 1000');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `MAX_MESSAGES = 100` | User-configurable `analysisWindowSize` | This phase | Users can tune analysis quality vs. history depth |

**No deprecated patterns in play.** The existing slider + chrome.storage pattern is current best practice for Chrome MV3 extensions.

## Open Questions

1. **Step size: 50 or 100?**
   - What we know: CONTEXT.md says "Step size of 100 (100, 200, 300... 1000 — 10 stops)" but also "Range: 50 to 1000"
   - What's unclear: min=50 + step=100 gives stops at 50, 150, 250... (odd numbers). min=50 + step=50 gives 50, 100, 150... (cleaner, 20 stops). min=100 + step=100 gives 100-1000 (10 stops) but excludes the special low-value 50.
   - Recommendation: Use `min="50" max="1000" step="50"`. This permits the 50 minimum with warning, gives clean 100-aligned values (100, 200, ... 1000) plus the 50 outlier. Planner should note this in the task.

2. **Where in options.html to place the new slider?**
   - What we know: "Place in existing settings section alongside topic/sentiment settings"
   - What's unclear: Topic Detection section or Sentiment Analysis section?
   - Recommendation: Topic Detection section — the window size directly affects how many messages are available for topic extraction. This is the most user-visible effect.

3. **Buffer cap strategy**
   - What we know: "Keep all accumulated messages in buffer — next analysis just slices to new window size"
   - What's unclear: Should the buffer grow unbounded, or should it be capped at some multiple of the max window?
   - Recommendation: Cap buffer at `windowSize * 2` or a fixed cap of 2000. At 5 msg/s this is ~6 minutes of data. Unbounded growth would consume memory over a multi-hour stream.

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `extension/sidebar/sidebar.js` (full file, verified all MAX_MESSAGES usages)
- Codebase direct read — `extension/sidebar/modules/StateManager.js` (full file, verified this.MAX_MESSAGES)
- Codebase direct read — `extension/options/options.js` (full file, verified slider pattern)
- Codebase direct read — `extension/options/options.html` (full file, verified existing slider HTML)
- Codebase direct read — `extension/sidebar/sidebar.html` (full file, verified stats div)
- Codebase direct read — `extension/sidebar/utils/ValidationHelpers.js` (full file, verified validateSettings)
- Codebase direct read — `extension/options/options.css` (full file, verified existing input[type=range] styles)
- Codebase direct read — `extension/content-script.js` (lines 1-74, verified 5-second BATCH_INTERVAL)

### Secondary (MEDIUM confidence)
- Chrome Extension MV3 `chrome.storage.sync` — behavior of `onChanged` event firing synchronously on write verified from understanding of how the existing code works

### Tertiary (LOW confidence)
- Time estimate formula (3 msgs/sec) — approximate, based on reasonable chat velocity assumption, not measured data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns directly verified from source
- Architecture: HIGH — both MAX_MESSAGES paths found and verified; settings pipeline end-to-end confirmed
- Pitfalls: HIGH for structural pitfalls; MEDIUM for the step-size inconsistency interpretation

**Research date:** 2026-02-19
**Valid until:** Stable — pure JavaScript/HTML; no external dependencies to track
