# Architecture Research

**Research Date:** 2026-02-19
**Dimension:** Architecture — Chrome extension integration for three specific improvements
**Question:** How do DOMPurify (no bundler), configurable thresholds via chrome.storage.sync, and WASM buffer increases integrate with the existing extension architecture?

---

## Component Map

The existing architecture has six clearly-bounded layers:

```
[Content Script]   →   [Background SW]   →   [Sidebar UI]   →   [WASM Engine]
content-script.js      background.js          sidebar.js          wasm_engine.js/.wasm
                                               ↕
                                         [LLM Adapter]
                                         llm-adapter.js
                                               ↕
                                        [Storage Layer]
                                      storage-manager.js
                                               ↕
                                       [Options Page]
                                       options/options.js
```

Each improvement touches a distinct subset of these layers.

---

## Improvement 1: DOMPurify Integration (No Bundler)

### Current State

`DOMHelpers.js` implements a custom `safeSetHTML()` that validates HTML against a whitelist of static regex patterns. `sidebar.js` still contains direct `innerHTML` assignments in approximately 20 locations (lines 360, 390, 417, 441, 521, 533, 548, 775, 795, 808, 826, 838, 845, 853, 857, 968, 1094, 1118, 1164, 1184, 1194, 1201, 1209, 1216, 1220). The pattern at line 441 constructs HTML using template literals with data from WASM output, which is the highest-risk location.

### Integration Point

**Affected component:** `extension/sidebar/` only. DOMPurify runs purely in the sidebar document context.

**Delivery mechanism for vanilla JS without a bundler:** Drop the DOMPurify distribution file into `extension/libs/dompurify/purify.min.js` and load it as a static script. Because the sidebar runs as a regular HTML page (not a content script), it can use a `<script src>` tag in `sidebar.html`. The existing CSP in `manifest.json` allows `script-src 'self'`, which covers scripts loaded from the extension origin.

```html
<!-- sidebar.html — add before sidebar.js -->
<script src="../libs/dompurify/purify.min.js"></script>
```

After loading, `window.DOMPurify` is available globally. `DOMHelpers.js` can be updated to wrap any `innerHTML` assignment with `DOMPurify.sanitize()`.

**What changes:**

- `extension/libs/dompurify/purify.min.js` — new file, no build step
- `extension/sidebar/sidebar.html` — one `<script>` tag added before `sidebar.js`
- `extension/sidebar/utils/DOMHelpers.js` — `safeSetHTML()` replaces its regex whitelist with `DOMPurify.sanitize()`; a new `safeSetHTMLPurified(element, html)` helper centralizes all callers
- `extension/sidebar/sidebar.js` — the approximately 20 direct `innerHTML` assignments migrate to the new helper; the highest-priority is the template literal at line 441 (topic tag construction) and the history card builder at line 1118

**What does not change:**

- `manifest.json` CSP — `script-src 'self'` already covers the file
- `content-script.js` — runs in page context, not sidebar; not affected
- `background.js` — no DOM involvement
- WASM engine — no change
- `options/options.js` — already uses `textContent` for form values; low priority

### Boundary

DOMPurify is entirely contained within the sidebar document. It does not cross into the background worker or content script. The library loads synchronously before `sidebar.js` so it is always available when the module initialises.

---

## Improvement 2: Configurable Thresholds via chrome.storage.sync

### Current State

The settings flow is already fully implemented end-to-end. This improvement is primarily about auditing for gaps and ensuring the pipeline is consistent:

- **Options page** (`options/options.js`) exposes sliders for `topicMinCount`, `spamThreshold`, `duplicateWindow`, and `moodUpgradeThreshold`. It saves to `chrome.storage.sync` under the key `settings`.
- **Sidebar** (`sidebar.js` lines 182–200) loads settings on startup and listens to `chrome.storage.onChanged` for live updates.
- **StateManager** (`modules/StateManager.js` line 15) holds a local copy initialised from `DEFAULT_SETTINGS`.
- **WASM call** (`sidebar.js` lines 304–308, 705–708) passes `settings.topicMinCount` and `settings.spamThreshold` as positional arguments to `analyze_chat_with_settings()`.
- **LLM Adapter** (`llm-adapter.js` line 351) reads `settings.moodUpgradeThreshold` from the settings object passed to `analyzeSentiment()`.

**The gap:** `duplicateWindow` is validated in `ValidationHelpers.js` (line 120) and present in `DEFAULT_SETTINGS` in `StateManager.js`, but the `analyze_chat_with_settings()` WASM call in `sidebar.js` uses a hardcoded value for `duplicate_window_ms` rather than reading `settings.duplicateWindow`. This is the one threshold that is not yet wired through.

### Data Flow (complete picture)

```
Options page slider
  → chrome.storage.sync.set({ settings })
      → sidebar chrome.storage.onChanged fires
          → settings object updated in sidebar.js
              → StateManager.settings updated
                  → next analyze_chat_with_settings() call uses new values
                      → WASM engine applies thresholds internally
                          → result returned via serde_wasm_bindgen
                              → ValidationHelpers.validateAnalysisResult() checks output
                                  → UI renders
```

**Settings object shape (as stored in chrome.storage.sync):**

```json
{
  "settings": {
    "topicMinCount": 5,
    "spamThreshold": 3,
    "duplicateWindow": 30,
    "moodUpgradeThreshold": 30,
    "aiSummariesEnabled": false
  }
}
```

**WASM function signature (lib.rs lines 539–543):**

```rust
pub fn analyze_chat_with_settings(
    messages_json: JsValue,
    topic_min_count: usize,
    spam_threshold: usize,
    duplicate_window_ms: f64,
) -> Result<JsValue, JsValue>
```

**Call site (sidebar.js line 304):**

```javascript
const result = wasmModule.analyze_chat_with_settings(
    messages,
    settings.topicMinCount,
    settings.spamThreshold,
    settings.duplicateWindow * 1000  // convert seconds → ms
);
```

### Component Boundaries

- **Options page → chrome.storage.sync:** Write-only from options page perspective
- **chrome.storage.sync → Sidebar:** Read on startup + live via `onChanged`
- **Sidebar → WASM:** Positional arguments at each call site (two call sites: regular analysis and batch replay)
- **Sidebar → LLM Adapter:** Settings object passed to `analyzeSentiment()`
- **No direct Options → WASM path:** Settings always mediated by chrome.storage.sync and sidebar

### What changes:

- `extension/sidebar/sidebar.js` — both `analyze_chat_with_settings()` call sites add `settings.duplicateWindow * 1000` as the third argument
- `extension/options/options.html` — confirm a slider exists for `duplicateWindow` (if not, add it)
- `extension/options/options.js` — confirm `duplicateWindow` is read, written, and displayed

No Rust changes are needed; `analyze_chat_with_settings` already accepts `duplicate_window_ms`.

---

## Improvement 3: WASM Buffer Size and Memory

### Current State

The WASM binary is compiled by `wasm-pack` using default memory settings. The generated `wasm_engine.js` glue code manages a `WebAssembly.Memory` object with auto-grow behaviour (`wasm_engine.js` line 406–407 rechecks the buffer on each data view access because the buffer reference becomes stale after a grow). The WASM binary itself does not declare an explicit initial page count, so it defaults to 16 pages (1 MiB).

The sidebar passes message arrays via `serde_wasm_bindgen`: serialisation copies the JS value into WASM linear memory, Rust processes it, then deserialises the result back out. For the current rolling window of 100 messages at ~200 bytes each, this is roughly 20 KiB per call — well within the default allocation.

### When Buffer Size Becomes Relevant

Buffer pressure arises if any of the following increases:

- **Message volume:** Rolling window cap (`MAX_MESSAGES = 100` in `sidebar.js` line 681 and `StateManager.js` line 51) is the primary control. Raising it to 500 would push per-call serialisation to ~100 KiB, which can trigger WASM grows mid-operation and temporarily degrade performance.
- **Message size:** `ValidationHelpers.js` line 16 caps message text at 1000 chars and author at 50 chars; the current 200-byte estimate is conservative. At maximum, 100 messages could be ~105 KiB.
- **Topic word lists:** The `STOP_WORDS`, `KNOWN_EMOTES`, `POSITIVE_WORDS`, `NEGATIVE_WORDS`, and `CONFUSED_INDICATORS` arrays live as static Rust arrays in `.rodata`, not in the grow-able heap. Expanding them does not affect linear memory pressure.

### Integration Path

WASM memory configuration is set at the Rust/`wasm-pack` level, not in JavaScript. Two mechanisms are available:

**Option A — Cargo.toml profile (recommended):**
```toml
# wasm-engine/Cargo.toml
[profile.release]
# wasm-pack uses --release by default
# No direct memory config here; use wasm-bindgen feature flags or linker args
```

Actually the correct approach for wasm-bindgen is to use the `#[wasm_bindgen(start)]` exported function or a `.cargo/config.toml` with target-specific linker flags:

```toml
# wasm-engine/.cargo/config.toml
[target.wasm32-unknown-unknown]
rustflags = ["-C", "link-args=--initial-memory=2097152"]  # 32 pages = 2 MiB
```

**Option B — Post-build patch of the generated JS:** The `wasm_engine.js` glue already handles grows transparently (line 406). No JS-side change is needed because grows are automatic.

**Practical recommendation:** For the current message window (100 messages, ~20 KiB per call), the default memory is adequate. If `MAX_MESSAGES` is raised above ~500, set `--initial-memory=4194304` (64 pages, 4 MiB) in `.cargo/config.toml` to avoid mid-operation grows.

### Memory Implications

- **Default (16 pages = 1 MiB):** Sufficient for 100-message window. Grows on demand if needed; each grow doubles the buffer and invalidates existing DataView/Uint8Array references (handled transparently by the generated glue at lines 406–420 of `wasm_engine.js`).
- **Fixed larger initial (32–64 pages):** Eliminates grow overhead during analysis but increases extension memory footprint by 1–3 MiB on startup, which is acceptable given Chrome extension sandboxing.
- **Maximum per Chrome:** Extensions share the process memory limit. WebAssembly.Memory grows up to the specified `maximum` pages if declared; without a maximum, it can grow until the browser enforces its per-tab limit (~4 GiB in theory, ~2 GiB in practice on 64-bit).

### Component Boundaries

- **Change location:** `wasm-engine/.cargo/config.toml` (Rust build toolchain) only
- **No JS changes required** for memory size — the glue code already handles grows
- **No manifest.json changes** — memory is internal to the WASM module
- **Rebuild required:** `./scripts/build.sh` must be re-run; the new `.wasm` binary replaces `extension/wasm/wasm_engine_bg.wasm`

---

## Combined Data Flow (all three improvements)

```
[Options Page]
  options.js writes { topicMinCount, spamThreshold, duplicateWindow,
                      moodUpgradeThreshold, aiSummariesEnabled }
  → chrome.storage.sync

[Sidebar startup]
  chrome.storage.sync.get('settings')
  → settings object (with defaults merged)
  → ValidationHelpers.validateSettings() — enforces ranges
  → StateManager.settings updated

[Content Script → Background → Sidebar]
  New messages arrive every 5 seconds

[Analysis Pipeline — sidebar.js]
  1. StateManager.addMessages(batch)           // rolling window, max 100
  2. wasmModule.analyze_chat_with_settings(    // WASM call
       messages,
       settings.topicMinCount,                //  ← from chrome.storage.sync
       settings.spamThreshold,               //  ← from chrome.storage.sync
       settings.duplicateWindow * 1000        //  ← from chrome.storage.sync (gap to fix)
     )
  3. ValidationHelpers.validateAnalysisResult(result)
  4. LLM Adapter: analyzeSentiment(messages, signals, settings)  // moodUpgradeThreshold
  5. Render:
       DOMHelpers.safeSetHTMLPurified(el, html)  // DOMPurify sanitizes before inject

[WASM Engine — wasm_engine.wasm]
  Initial memory: ~1 MiB default (or configured via .cargo/config.toml)
  Receives: messages[] via serde_wasm_bindgen JSON
  Applies: spam filter → topic extraction → clustering → sentiment
  Returns: AnalysisResult via serde_wasm_bindgen JSON
```

---

## Build Order (dependency sequencing)

The three improvements are independent of each other but have internal sequencing requirements:

### Phase 1: WASM Memory Configuration (no JS dependencies)
1. Create `wasm-engine/.cargo/config.toml` with `--initial-memory` flag if buffer increase is desired
2. Run `./scripts/build.sh` — rebuilds `.wasm` binary and JS glue
3. Verify with `cargo test` in `wasm-engine/` — no Rust logic changes, existing 18 tests should pass unchanged
4. Load extension in Chrome, verify no console errors on WASM init

**Why first:** Changes the binary artifact. Must be done before any JS work that tests memory behaviour. If skipped, the default is safe and this phase can be deferred.

### Phase 2: DOMPurify Integration (sidebar only, no build step)
1. Download `purify.min.js` to `extension/libs/dompurify/`
2. Add `<script src="../libs/dompurify/purify.min.js"></script>` to `sidebar.html`
3. Update `DOMHelpers.safeSetHTML()` to use `DOMPurify.sanitize()`
4. Migrate the ~20 `innerHTML` call sites in `sidebar.js` to `DOMHelpers.safeSetHTMLPurified()`
5. Manual test: load extension, verify topic cloud, cluster cards, history cards render correctly

**Why second:** Purely additive to the sidebar layer. Does not touch settings or WASM. Can be tested immediately without rebuilding.

**Constraint:** `sidebar.html` must load `purify.min.js` before `sidebar.js` to ensure `window.DOMPurify` is defined when the module initialises. Since `sidebar.js` is a `type="module"` script and DOMPurify is a classic script, load order in HTML is deterministic.

### Phase 3: Configurable Thresholds — Wire duplicateWindow (sidebar only)
1. Confirm `duplicateWindow` slider exists in `options.html` (if not, add it)
2. Confirm `options.js` reads and writes `duplicateWindow` from/to `chrome.storage.sync`
3. In `sidebar.js`, update both `analyze_chat_with_settings()` call sites (lines ~304 and ~705) to pass `settings.duplicateWindow * 1000` as the third argument
4. Verify `ValidationHelpers.validateSettings()` enforces the `duplicateWindow` range (5–300 seconds) — this is already implemented at line 120
5. Manual test: change `duplicateWindow` in options, verify sidebar respects it

**Why third:** Depends on the existing settings infrastructure already working correctly. Simplest change — two lines in `sidebar.js`. No WASM rebuild needed.

---

## Key Risks and Constraints

**DOMPurify + CSP:** The existing CSP (`script-src 'self'`) allows loading the local `purify.min.js` file. DOMPurify itself does not make network requests. No CSP change required.

**DOMPurify configuration for WASM output:** WASM output arriving in sidebar has already passed through `ValidationHelpers.validateAnalysisResult()`. DOMPurify is a second defence layer. The default DOMPurify config (strips scripts, event handlers) is appropriate; no custom config needed for this use case.

**chrome.storage.sync quota:** The settings object (~5 fields, primitive values) is well under the 8 KiB per-item limit and the 100 KiB total sync quota.

**Duplicate DEFAULT_SETTINGS definitions:** `DEFAULT_SETTINGS` is currently defined in three places: `sidebar.js` (line 13), `StateManager.js` (line 267), and `options.js` (line 3). These are structurally identical but maintained separately. This is an existing concern — any new threshold field must be added to all three. There is no shared constants module.

**WASM grow and DataView invalidation:** The generated glue (`wasm_engine.js` lines 406–420) already handles the case where `wasm.memory.buffer` is detached after a grow by re-creating the DataView. No JS-side code needs to handle this explicitly.

**No bundler constraint:** All three improvements are compatible with the no-bundler approach. DOMPurify is loaded as a static file. Settings flow is pure chrome API. WASM memory is configured at compile time via rustflags. None of these require npm, esbuild, or webpack.

---

## Summary Table

| Improvement | Layers Touched | Files Changed | Build Required | Risk |
|---|---|---|---|---|
| DOMPurify | Sidebar UI only | `sidebar.html`, `DOMHelpers.js`, `sidebar.js` | No | Low — additive, gracefully degrades if library missing |
| Configurable thresholds (duplicateWindow gap) | Sidebar UI, Options Page | `sidebar.js` (2 lines), `options.html`, `options.js` | No | Low — existing pipeline already works |
| WASM buffer size | WASM Engine only | `.cargo/config.toml` | Yes (`./scripts/build.sh`) | Low — transparent to JS; default is already safe |
