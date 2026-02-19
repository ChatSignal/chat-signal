# Pitfalls Research: DOMPurify, WASM Buffer, and Configurable Thresholds

**Research type:** Project Research — Pitfalls dimension
**Milestone context:** Subsequent milestone — improving an existing Chrome extension
**Date:** 2026-02-19
**Question:** What do Chrome extension developers commonly get wrong when integrating DOMPurify into MV3 extensions, increasing WASM buffer sizes, and adding user-configurable thresholds?

---

## Overview

Three improvements are planned for this codebase: DOMPurify integration (vanilla JS, no bundler), raising `MAX_MESSAGES` from 100 to 500+, and exposing new configurable thresholds to the options page. Each has a distinct failure mode profile. The pitfalls below are specific to this stack (MV3, Rust/WASM via `wasm-pack`, `serde_wasm_bindgen`, `chrome.storage.sync`, no bundler) and to what the codebase already contains.

---

## Domain 1: DOMPurify Integration in a Chrome MV3 Extension

### Pitfall 1.1 — Using an older DOMPurify build that internally called `Function()`

**What goes wrong:** DOMPurify versions around 1.0.0 used `new Function(...)` in its internal `getGlobal` implementation. That construct requires `unsafe-eval` in CSP, which MV3 extension pages unconditionally block. Attempting to load such a version in the sidebar produces a CSP violation logged in the extension service worker console, and DOMPurify silently falls back to no-op or throws, leaving `innerHTML` unsanitized. The error is easy to miss because DOMPurify does not hard-crash; it returns the input string unchanged in some failure modes.

**Warning signs:**
- Console error: `Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive`
- Error appears at sidebar load time, not during sanitize calls
- DOMPurify appears to be loaded (global exists) but sanitize returns unsanitized HTML

**Prevention strategy:** Download DOMPurify 3.x from the official dist. The `unsafe-eval` dependency was removed in the 2.x era. Verify the downloaded `purify.min.js` does not contain the string `new Function` before committing it. The current version (3.3.x) is pure DOM-based and has no eval dependency; it works under `script-src 'self'` with no CSP changes required.

**Phase:** Pre-implementation. Verify DOMPurify version before dropping the file into `extension/libs/`.

---

### Pitfall 1.2 — Assuming `script-src 'self'` covers the content script context

**What goes wrong:** The manifest CSP `extension_pages` directive governs pages rendered from the extension origin: the sidebar (`sidebar.html`), the options page, and the background service worker. Content scripts (`content-script.js`) run in the host page's context and are governed by the *host page's* CSP, not the extension's. Attempting to import or reference `chrome.runtime.getURL('libs/dompurify/purify.min.js')` from inside a content script will either be blocked by the host page's CSP or succeed silently but not be useful because DOMPurify's DOM is the host page DOM, not the extension document.

**Why this matters here:** DOMPurify is only needed in the sidebar (the ~20 `innerHTML` sites are all in `sidebar.js` and `DOMHelpers.js`). If a developer mistakenly tries to use DOMPurify in `content-script.js` for any reason, it will intermittently fail on sites with strict CSP and pass on permissive sites, producing confusing, site-specific bugs.

**Warning signs:**
- DOMPurify works on YouTube but not on Twitch (or vice versa) from the content script
- Errors like `Refused to load the script 'chrome-extension://...'` in the host page console, not the extension console
- No errors at all when testing on `about:blank` (permissive) vs real sites

**Prevention strategy:** Keep DOMPurify confined to `extension/sidebar/`. The load point is the `<script>` tag in `sidebar.html`, before `sidebar.js`. Do not add it to `content_scripts` in `manifest.json`. Document this boundary explicitly in `DOMHelpers.js` with a comment.

**Phase:** Implementation. Check during manifest review.

---

### Pitfall 1.3 — Loading DOMPurify after the ES module that uses it

**What goes wrong:** `sidebar.js` is loaded as `<script type="module">`. Classic scripts (loaded without `type="module"`) and module scripts have different evaluation ordering in HTML. A module script defers by default and is evaluated after the document's classic scripts. However, if `purify.min.js` (a classic script) is placed *after* `sidebar.js` in `sidebar.html`, `window.DOMPurify` will be undefined when `DOMHelpers.js` first executes `DOMPurify.sanitize()`.

The failure mode is a `ReferenceError: DOMPurify is not defined` that only fires when the first sanitize call executes (not at script load time), making it appear intermittent if early render paths do not immediately call sanitize.

**Warning signs:**
- `ReferenceError: DOMPurify is not defined` in the sidebar console
- Error appears only when topics or cluster cards first render, not at sidebar open
- Error disappears if you open DevTools before opening the sidebar (because DevTools evaluation changes timing)

**Prevention strategy:** Place `<script src="../libs/dompurify/purify.min.js"></script>` *before* `<script type="module" src="sidebar.js"></script>` in `sidebar.html`. This is the correct order: classic scripts execute synchronously in document order, so `window.DOMPurify` is defined before the module begins evaluating. This is already noted in the architecture research (ARCHITECTURE.md) as a constraint.

**Phase:** Implementation. Verify HTML script tag order in the first working test.

---

### Pitfall 1.4 — Forgetting to sanitize WASM output that flows through template literals

**What goes wrong:** Several `innerHTML` assignments in `sidebar.js` construct HTML strings via template literals that embed WASM-originated data. The highest-risk site is around line 441 (topic tag construction) and lines 1118, 1184, 1194 (history card builders). A developer doing a "find innerHTML and wrap with DOMPurify" pass may correctly update the `DOMHelpers.safeSetHTML()` utility but leave template literal constructions that bypass the helper entirely.

The specific risk: `topic.term` from WASM output is a string that passed through `ValidationHelpers.validateAnalysisResult()` length checks but not HTML-encoding. If a chat message contains `<img src=x onerror=alert(1)>` as a term, and it slips through topic extraction (which filters by word boundaries but does not strip HTML), it would be injected raw into a topic tag via template literal.

**Warning signs:**
- Audit shows `innerHTML` assignments eliminated but `element.innerHTML = \`...\`` patterns remain
- Topics or history cards render HTML tags visible in the UI (visual rendering of `<b>` as bold where plain text was expected)
- `grep -n 'innerHTML' extension/sidebar/sidebar.js` still returns hits after the migration pass

**Prevention strategy:** After the DOMPurify migration, run `grep -n 'innerHTML' extension/sidebar/` to confirm zero direct assignments remain. Every HTML construction path — template literals, string concatenation, and utility helpers — must end at `DOMHelpers.safeSetHTMLPurified()`. The existing `DOMHelpers.safeSetHTML()` already has a regex allowlist; replacing it with `DOMPurify.sanitize()` and making that function the sole HTML injection point prevents gaps.

**Phase:** Implementation. Add to manual test checklist.

---

### Pitfall 1.5 — Miscounting CSP contexts and adding `wasm-unsafe-eval` to the wrong directive

**What goes wrong:** MV3 manifest CSP has two separate contexts: `extension_pages` (covers popup, sidebar, options, background service worker) and `sandbox` (covers sandboxed pages explicitly listed under the `sandbox` manifest key). Developers who read that `wasm-unsafe-eval` is needed for WebAssembly sometimes move it to the `sandbox` key by mistake, removing it from `extension_pages`, breaking WASM initialization. The existing manifest is already correctly configured (`extension_pages` contains `wasm-unsafe-eval`); this pitfall is relevant if anyone modifies the manifest during this milestone.

DOMPurify does not require any CSP change. The risk is a reflex edit to manifest.json during DOMPurify integration that accidentally removes or relocates `wasm-unsafe-eval`.

**Warning signs:**
- WASM fails to initialize after manifest edit: `WebAssembly.instantiate()` throws a CSP error
- DOMPurify works but `analyze_chat_with_settings` silently never fires
- Error in service worker console: `Refused to compile or instantiate WebAssembly module because 'wasm-unsafe-eval' is not an allowed source`

**Prevention strategy:** Do not touch `manifest.json` during the DOMPurify integration. DOMPurify running from a local file under `script-src 'self'` requires no CSP modification. After any manifest change, load the extension unpacked and verify the extension loads without errors in `chrome://extensions`.

**Phase:** Implementation. Pre-commit check.

---

## Domain 2: Increasing WASM Memory / Message Buffer Size

### Pitfall 2.1 — Confusing the JS-side rolling window cap with WASM linear memory

**What goes wrong:** `MAX_MESSAGES = 100` in `sidebar.js` line 681 is a JavaScript array length cap, not a WASM memory setting. WASM linear memory is separate and auto-grows on demand through the `wasm_engine.js` glue. A developer raising `MAX_MESSAGES` to 500 may believe they also need to change WASM memory configuration and add `--initial-memory` flags to `.cargo/config.toml`. This is correct reasoning but leads to a different mistake: setting `--initial-memory` to a value much larger than needed (e.g., 64 MiB "to be safe"), causing a 64 MiB allocation at extension startup on every sidebar open, impacting memory-constrained users.

**The actual math:** 500 messages at ~200 bytes average text = ~100 KiB per `serde_wasm_bindgen` call. WASM default initial memory is 1 MiB (16 pages × 64 KiB). The first analysis call at 500 messages will trigger at most 1 grow event (from 1 MiB to 2 MiB), which the generated glue handles transparently. Setting `--initial-memory=2097152` (2 MiB, 32 pages) eliminates even that one grow. Anything higher is unnecessary for this use case.

**Warning signs:**
- Extension memory footprint in `chrome://task-manager` increases by 10+ MiB after a `--initial-memory` change
- No observable performance difference after memory configuration change (grow was not the bottleneck)
- `.cargo/config.toml` initial memory set to values like 16 MiB or 64 MiB

**Prevention strategy:** Set `--initial-memory=2097152` (32 pages) if the grow overhead is measurable. Profile first using Chrome DevTools Memory panel before setting any initial memory value. The default (auto-grow) is safe and correct for the 500-message target; initial memory configuration is an optimization, not a prerequisite.

**Phase:** Pre-implementation profiling. Apply only if measured latency regression is observed.

---

### Pitfall 2.2 — Serialization cost scales super-linearly with message count via `serde_wasm_bindgen`

**What goes wrong:** Each call to `analyze_chat_with_settings(messages, ...)` serializes the entire `allMessages` array from JS into WASM linear memory via `serde_wasm_bindgen::from_value()`, then deserializes the result back. This is O(n) in message count. Raising `MAX_MESSAGES` from 100 to 500 multiplies the per-call allocation and copy work by 5x. On a fast machine this may be imperceptible (milliseconds), but on mid-range hardware or under GC pressure it can push analysis time past the 5-second message batch interval, causing queued batches to back up.

The existing codebase already uses `serde_wasm_bindgen` (which is the correct, officially-recommended approach and faster than `JsValue::from_serde`/`into_serde`). The risk is not choosing the wrong library but assuming the 5x data increase is free.

**Warning signs:**
- Analysis calls taking >100ms visible in DevTools Performance flame chart at 500 messages
- `processMessages` function shown as a long task in the "Long Tasks" overlay
- `allMessages.push(...message.messages)` array growing without bound if `MAX_MESSAGES` check has an off-by-one error

**Prevention strategy:** Profile `analyze_chat_with_settings` call duration with 100 vs 500 messages using `console.time` before committing the buffer increase. If >50ms per call, consider processing only the delta (new messages since last call) and accumulating results in JS rather than re-running analysis on the full rolling window every batch. The current architecture passes the full `allMessages` array on each call; this is simple but wasteful at higher counts.

**Phase:** Pre-implementation profiling. Measure before raising `MAX_MESSAGES`.

---

### Pitfall 2.3 — Raising `MAX_MESSAGES` but not accounting for the three separate accumulation paths

**What goes wrong:** The buffer cap `MAX_MESSAGES = 100` appears to be defined once (line 681 in `sidebar.js`), but there are three separate message accumulation paths in the codebase:

1. `allMessages` in `sidebar.js` — the rolling window for analysis (line 680-681)
2. `sessionQuestions` in `sidebar.js` — capped separately at `MAX_SESSION_QUESTIONS = 50` (line 95)
3. `StateManager` message state — used for session-wide statistics accumulation (separate path)

A developer changing only `MAX_MESSAGES` in `sidebar.js` raises the analysis window but leaves `StateManager` state unchanged and does not affect session-wide stats. If `StateManager.js` has its own hardcoded `MAX_MESSAGES` constant (it does, at line 51 per the architecture research), failing to update it means the analysis window and the state manager drift out of sync, causing the session-wide stats to accumulate from only 100 messages while analysis uses 500.

**Warning signs:**
- Analysis shows topics and clusters based on 500-message context
- Session summary stats (message counts, cumulative sentiment) appear lower than expected
- Searching for `MAX_MESSAGES` or `100` in `StateManager.js` reveals a separate constant

**Prevention strategy:** Before changing any buffer size, grep the entire codebase for the literal value `100` and for `MAX_MESSAGES` to find all accumulation caps. Update them consistently, or introduce a shared constants module. Given the existing `DEFAULT_SETTINGS` duplication problem (three separate definitions noted in the architecture research), this project has a pattern of duplicated magic numbers — treat buffer size the same way.

**Phase:** Pre-implementation. Audit before making changes.

---

### Pitfall 2.4 — WASM module re-instantiation cost when the MV3 service worker restarts

**What goes wrong:** The WASM module is loaded in the sidebar (not the background service worker), so service worker restarts do not directly affect WASM instantiation. However, if the sidebar is closed and reopened (e.g., user clicks the extension icon toggle), `import()` of the WASM module runs again from scratch. The `.wasm` binary is cached by the browser, but `WebAssembly.instantiate()` still runs the compilation step on each import. At ~40-60 KiB of WASM binary, this takes tens of milliseconds. Raising the initial memory configuration to 2 MiB adds to this startup cost.

The more relevant risk: if a future refactor moves analysis to the background service worker to support offscreen documents, the service worker termination cycle (Chrome terminates idle service workers after 30 seconds) would re-instantiate WASM on every idle-then-active cycle. At 500 messages per analysis window, the re-instantiation plus first-call serialization cost could produce a noticeable lag spike after any chat pause.

**Warning signs:**
- Visible delay (>200ms) when reopening the sidebar after it was closed
- Analysis gap at the start of a session — first render is slow, subsequent renders are fast
- If moved to service worker: analysis drops out during quiet chat periods and lags on resumption

**Prevention strategy:** Keep WASM analysis in the sidebar document context (not the background service worker). The sidebar remains alive as long as it is open. Sidebar reload cost is acceptable as a one-time initialization. Do not move WASM to the background service worker without profiling the termination-and-restart cycle.

**Phase:** Architecture review if any refactoring touches message routing.

---

## Domain 3: User-Configurable Thresholds — Options Page Validation

### Pitfall 3.1 — `parseInt` on an empty input returns `NaN`, which passes `chrome.storage.sync.set()` silently

**What goes wrong:** The existing `getInputValues()` in `options/options.js` uses `parseInt(inputs.topicMinCount.value, 10)` for each numeric field. If the user clears an input field entirely (deletes all characters), `inputs.topicMinCount.value` is `""`, and `parseInt("", 10)` returns `NaN`. `NaN` is a valid JavaScript value that passes object property assignment and `chrome.storage.sync.set()` without throwing. When the sidebar loads this setting and passes it to `analyze_chat_with_settings()`, WASM receives `NaN` as a `usize` argument, which coerces to `0` in Rust/WASM. A `topicMinCount` of `0` means every word appears in topics, flooding the topics cloud. A `spamThreshold` of `0` means no spam filtering at all.

The current `ValidationHelpers.validateSettings()` in `sidebar.js` checks `typeof settings.topicMinCount !== 'number'` — but `typeof NaN === 'number'` in JavaScript. This check passes for `NaN`.

**Warning signs:**
- Clearing an options field and saving produces no error message
- After save, topics cloud shows every word that appeared even once
- `ValidationHelpers.validateSettings()` does not catch the corruption; settings are accepted
- `chrome.storage.sync` contains `{"settings": {"topicMinCount": null}}` or `NaN` (stored as `null` in JSON)

**Prevention strategy:** In `options/options.js`, add `isNaN()` guards before saving. Replace `parseInt(value, 10)` with a helper that:
1. Parses the value
2. Checks `Number.isNaN(result)` and falls back to the default if true
3. Clamps to the allowed range

Also update `ValidationHelpers.validateSettings()` in `sidebar.js` to use `Number.isFinite()` instead of `typeof x === 'number'` for numeric threshold fields, since `typeof NaN === 'number'` and `typeof Infinity === 'number'` both pass the current check.

**Phase:** Implementation. Required before the options page ships any new threshold.

---

### Pitfall 3.2 — HTML5 `type="number"` min/max attributes do not prevent invalid saves in Chrome

**What goes wrong:** The options page uses `<input type="number" min="1" max="100">` style attributes. Chrome's native form validation will show a tooltip if the user tries to submit a value outside the range *via the form submit button*. However, the extension options page may not use form submission — the `saveSettings` function is wired to a button click, not a `<form>` submit event. Even if it is wired to form submit, the HTML5 constraint validation only runs on `form.reportValidity()` or `form.checkValidity()`. Without an explicit call to one of these, the out-of-range value is read by `getInputValues()` and stored.

Additionally, `type="number"` inputs in Chrome return an empty string (`""`) for their `.value` property if the value fails the browser's number parsing (e.g., contains a decimal when `step="1"` is set). The developer sees the number on screen but `parseInt("")` returns `NaN`.

**Warning signs:**
- Setting `moodUpgradeThreshold` to `999` (above the `max` attribute) and saving succeeds without error
- Setting `topicMinCount` to `0.5` (decimal with `step="1"`) saves as `NaN` internally
- Options page save button is wired to `click` not `form submit`, bypassing constraint validation

**Prevention strategy:** Add explicit JavaScript range validation in `saveSettings()` before calling `chrome.storage.sync.set()`. Show an inline error message for out-of-range values rather than relying on HTML5 constraint validation. The HTML5 attributes are UX helpers, not the security boundary. Also call `form.checkValidity()` at the top of `saveSettings()` as a first line of defence, then apply the JS range checks as a second line.

**Phase:** Implementation. Required before shipping any new configurable threshold.

---

### Pitfall 3.3 — Interdependent thresholds saved independently without cross-validation

**What goes wrong:** Some thresholds have implicit relationships. `sentimentSensitivity` sets the minimum signal count required to declare a non-neutral mood. `moodUpgradeThreshold` sets the score required to upgrade positive→excited or negative→angry. If `sentimentSensitivity` is set to 10 (require 10 signals before any mood) but `moodUpgradeThreshold` is set to 5 (upgrade at score 5), the upgrade can never fire because 10 signals producing a score of 5 represents an average per-signal score of 0.5 — feasible but rare. The settings are not technically invalid individually, but the combination produces results that confuse users.

A more concrete cross-validation issue: if an `analysisWindowSize` setting is added (as recommended in the FEATURES research), setting `analysisWindowSize=50` with `topicMinCount=20` means every word needs to appear in 40% of messages to become a topic. The topics cloud will always be empty, and users will think the extension is broken.

**Warning signs:**
- User sets a combination of thresholds where the extension produces no output (empty topics, always neutral)
- User reports "extension stopped working" after changing settings
- No validation error shown because each value is individually valid

**Prevention strategy:** Add cross-validation to the options page save handler for known interactions. Specifically:
- If `analysisWindowSize` is added: warn if `topicMinCount > analysisWindowSize * 0.3` (a topic needs >30% frequency to appear)
- Consider displaying a calculated "effective sensitivity" that combines `sentimentSensitivity` with window size to give users intuition about what their settings mean

Document the interactions in the options page UI using helper text under each slider, not just tooltips (tooltips are not shown on mobile or when users are moving quickly).

**Phase:** Implementation. Add during options page UI design, not as an afterthought.

---

### Pitfall 3.4 — Stale settings used in analysis after `chrome.storage.sync.set()` is called

**What goes wrong:** The sidebar listens for settings changes via `chrome.storage.onChanged` (line 197-200 in `sidebar.js`). When the user saves new settings in the options page, `chrome.storage.sync.set()` fires the `onChanged` event in the sidebar. However, there is a race condition: if a message batch arrives and triggers `processMessages()` at the same moment as the `onChanged` event fires, the `settings` object used in the `analyze_chat_with_settings()` call may be the old value if the event handler has not yet updated `settings`.

This is low probability in practice (batches arrive every ~5 seconds from the content script) but becomes more likely if settings are changed frequently during an active stream. The result is one analysis call using stale thresholds, which produces an inconsistent result that is overwritten by the next batch and unlikely to be noticed.

A more concrete version: the existing code has `settings` as a module-level `let` variable in `sidebar.js`. The `onChanged` handler updates it. The `processMessages` function reads it. These run in the same JS event loop, so there is no true concurrency, but if `processMessages` is called *from within* the onChanged handler's microtask queue (possible if message arrival and settings change overlap), the `settings` reference read by `processMessages` reflects the new value mid-call, not the old or new consistently.

**Warning signs:**
- Toggling settings rapidly produces analysis results that don't reflect either the old or new settings
- Settings change in options page does not visibly affect the sidebar until 2 batches later (settings updated but then overwritten by stale StateManager copy)
- `StateManager.settings` and `sidebar.js` `settings` module variable diverge (both exist and are updated separately)

**Prevention strategy:** Accept this as a non-issue for the intended use case (settings are changed before a stream, not during analysis). Document it as a known limitation. If it becomes a real user complaint, the fix is to snapshot `settings` into a local `const` at the top of each `processMessages()` call rather than reading the module-level variable. The existing `DEFAULT_SETTINGS` duplication problem (three separate objects across `sidebar.js`, `StateManager.js`, and `options.js`) is the larger concern — a new threshold added to one but not all three will silently use the default in the other two locations.

**Phase:** Pre-implementation. Update all three `DEFAULT_SETTINGS` copies when adding any new threshold.

---

### Pitfall 3.5 — `chrome.storage.sync` quota exceeded silently when new threshold fields are added

**What goes wrong:** `chrome.storage.sync` has a per-item quota of 8,192 bytes and a total sync quota of 102,400 bytes. The settings object is small (five numeric fields + one boolean = well under 200 bytes). However, `chrome.storage.sync.set()` rejects the write silently (via `chrome.runtime.lastError`) if quota is exceeded. The existing `saveSettings()` function has a `.catch()` but the error is only logged to the console, not surfaced to the user.

Adding four new threshold fields does not approach the quota limit. The quota risk is elsewhere: the storage-manager also uses `chrome.storage.local` for session history. If session history grows large (many saved sessions with large topic lists), a developer might attempt to move settings to `local` storage instead of `sync`. The pitfall is that `local` storage has a 5 MiB default quota but no sync across devices, breaking user expectations if they switch computers.

The more immediate quota pitfall: if a future improvement stores the analysis window (up to 500 messages × 200 bytes = 100 KiB) in storage for session resumption, the sync quota would be exceeded immediately.

**Warning signs:**
- `chrome.runtime.lastError` in the console after saving settings
- Settings appear to save (no error shown in UI) but revert to defaults on reload
- `chrome.storage.sync.getBytesInUse('settings')` returns a value unexpectedly close to 8192

**Prevention strategy:** Never store large data structures (message arrays, full session data) in `chrome.storage.sync`. Keep sync storage for primitive settings values only. Session data already correctly uses `chrome.storage.local` via `storage-manager.js`. If adding new thresholds, verify with `chrome.storage.sync.getBytesInUse('settings')` in the DevTools console after saving. The four proposed threshold additions are primitives and will not trigger quota issues.

**Phase:** Implementation review. Check storage allocation after any new field additions.

---

## Summary Table

| # | Pitfall | Domain | Severity | Phase |
|---|---------|--------|----------|-------|
| 1.1 | Old DOMPurify build requiring `unsafe-eval` | DOMPurify/CSP | High | Pre-impl |
| 1.2 | DOMPurify used in content script context | DOMPurify/CSP | Medium | Implementation |
| 1.3 | Classic script loaded after ES module | DOMPurify/CSP | High | Implementation |
| 1.4 | Template literal `innerHTML` sites missed | DOMPurify/CSP | High | Implementation |
| 1.5 | Accidental CSP edit removes `wasm-unsafe-eval` | DOMPurify/CSP | High | Implementation |
| 2.1 | Confusing JS buffer cap with WASM linear memory | WASM memory | Medium | Pre-impl |
| 2.2 | 5x serde serialization cost at 500 messages | WASM memory | Medium | Pre-impl profiling |
| 2.3 | Three separate accumulation paths not updated consistently | WASM memory | High | Pre-impl |
| 2.4 | WASM re-instantiation cost if moved to service worker | WASM memory | Low | Architecture review |
| 3.1 | `parseInt("")` → `NaN` passes `typeof` check, corrupts WASM args | Thresholds | High | Implementation |
| 3.2 | HTML5 min/max bypassed when save wired to click not form submit | Thresholds | High | Implementation |
| 3.3 | Interdependent thresholds produce empty/broken output | Thresholds | Medium | Implementation |
| 3.4 | Stale settings from `DEFAULT_SETTINGS` defined in three places | Thresholds | Medium | Pre-impl |
| 3.5 | Large objects in `chrome.storage.sync` silently fail quota | Thresholds | Low | Implementation review |

---

## Sources

- [Manifest - Content Security Policy | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Chrome Extension Manifest v3 refuses to evaluate unsafe-eval / wasm-unsafe-eval · wasm-bindgen #3098](https://github.com/rustwasm/wasm-bindgen/issues/3098)
- [Usage of DOMPurify requires "unsafe-eval" CSP since 1.0.0 · DOMPurify #249](https://github.com/cure53/DOMPurify/issues/249)
- [Chrome complains about an unsafe-eval · DOMPurify #107](https://github.com/cure53/DOMPurify/issues/107)
- [JsValue::from_serde is very slow compared to pass string from WASM to js · wasm-bindgen #2539](https://github.com/rustwasm/wasm-bindgen/issues/2539)
- [Returning large data from Rust to JS is slow · wasm-bindgen #1205](https://github.com/wasm-bindgen/wasm-bindgen/issues/1205)
- [Deprecate JsValue::from_serde and JsValue::into_serde · wasm-bindgen #3031](https://github.com/rustwasm/wasm-bindgen/pull/3031)
- [Avoiding using Serde in Rust WebAssembly When Performance Matters | Medium](https://medium.com/@wl1508/avoiding-using-serde-and-deserde-in-rust-webassembly-c1e4640970ca)
- [The extension service worker lifecycle | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [serde_wasm_bindgen - Rust docs](https://docs.rs/serde-wasm-bindgen/latest/serde_wasm_bindgen/)
- [Improve extension security | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
- [Browser Extension Vulnerabilities - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html)
- [Concurrent update of chrome.storage.local - Chromium Extensions Group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU)
- [Manifest V3 Question - Race Condition Prevention - Chromium Extensions Group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pKqKE7Ibq54)
- [chrome.storage API | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Up to 4GB of memory in WebAssembly | V8 Blog](https://v8.dev/blog/4gb-wasm-memory)
- [Offscreen Documents in Manifest V3 | Chrome for Developers](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3)
