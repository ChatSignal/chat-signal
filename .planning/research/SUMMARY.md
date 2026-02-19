# Project Research Summary

**Project:** Chat Signal Radar — Targeted Improvements Milestone
**Domain:** Chrome MV3 Extension with Rust/WASM analysis engine
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

This milestone targets three well-scoped improvements to an already-shipped Chrome extension: replacing a home-grown HTML sanitizer with DOMPurify, increasing the WASM analysis window from 100 to 500 messages, and exposing two hardcoded constants (`MAX_MESSAGES` and `INACTIVITY_TIMEOUT`) as user-configurable thresholds in the options page. All three improvements fit within the existing architecture without new patterns, new dependencies on build tooling, or changes to the Rust WASM engine's logic. The recommended stack is completely additive: vendor DOMPurify 3.3.1 as a static file (matching how WebLLM is handled), bump one JS constant, and add two fields to the existing `DEFAULT_SETTINGS` objects.

The recommended implementation order is: WASM memory configuration first (the one build step, can be deferred if profiling shows it is unnecessary), DOMPurify second (purely additive to the sidebar), and configurable thresholds third (wire two hardcoded constants through the existing settings pipeline). Each improvement is independently testable and none blocks the others. The highest risk across all three improvements is the `DEFAULT_SETTINGS` duplication problem: three separate copies exist across `sidebar.js`, `StateManager.js`, and `options.js`. Any new threshold field must be added to all three, and forgetting any one produces silent misbehavior with no error.

The only non-trivial pitfall cluster concerns DOMPurify integration: using an old build that requires `unsafe-eval`, loading it after the ES module that uses it, and leaving template-literal `innerHTML` assignments unguarded after the migration pass. All three are caught by a single post-migration grep (`grep -n 'innerHTML' extension/sidebar/sidebar.js`) that should read zero results when the work is done. The `analysisWindowSize` and `inactivityTimeout` settings have no dependency on each other or on the DOMPurify work, and the WASM functions already accept arbitrary-length message arrays — no Rust changes are required for any of these improvements.

## Key Findings

### Recommended Stack

All three improvements use the project's existing technology stack with no new additions except a single vendored library. See `.planning/research/STACK.md` for full detail.

**Core technologies:**

- **DOMPurify 3.3.1** (`extension/libs/dompurify/purify.min.js`): DOM sanitization — replaces the custom regex allowlist in `DOMHelpers.js`; ~20 KB minified, no eval dependency, no CSP change required, vendor as a static file identical to how WebLLM is handled
- **chrome.storage.sync** (existing): User preference storage for the two new threshold fields — `analysisWindowSize` and `inactivityTimeout`; well within quota limits; real-time propagation via existing `onChanged` listener already in `sidebar.js`
- **wasm-engine/.cargo/config.toml** (Rust linker flags, optional): WASM initial memory configuration — only needed if profiling shows grow-overhead latency at 500-message batches; the default auto-grow is safe and this is an optimization

**What to avoid:**

- Web Sanitizer API / `setHTML()` — still experimental in Chrome Canary only as of February 2026
- SharedArrayBuffer for WASM serialization — requires COOP/COEP headers incompatible with extension sidebar pages
- Moving analysis to the background service worker — the 30-second idle termination cycle would cause lag spikes after quiet chat periods

### Expected Features

See `.planning/research/FEATURES.md` for full detail.

**Must have (table stakes — already shipped or exposing existing hardcoded constants):**

- **Sentiment sensitivity threshold** (`sentimentSensitivity`) — already shipped; prevents "always neutral" for small streamers and wild swings for large streamers
- **Topic minimum count** (`topicMinCount`) — already shipped; prevents empty topics for small streamers and noise floods for large ones
- **Inactivity timeout** (expose `INACTIVITY_TIMEOUT` constant) — primary gap; 2-minute hardcoded value triggers false "stream ended?" prompts during ad breaks and BRB screens, eroding user trust in the smart session detection feature

**Should have (differentiators worth building now):**

- **Analysis window size** (`analysisWindowSize`, default 500) — no comparable Chrome extension exposes this; exposes `MAX_MESSAGES` constant; medium complexity; use labeled presets ("Small / Medium / Large") rather than raw number slider to prevent users from setting values that produce empty topics

**Defer (v2+):**

- Time-based analysis window (seconds) — requires timestamp-based array trimming, adds complexity for minimal benefit over count-based window
- Per-category sensitivity (Questions vs. Issues vs. Requests) — high explanation cost, low payoff for target user
- Custom sentiment keyword lists — requires parameterizing Rust compile-time constants; 5-10x complexity; future idea in existing roadmap
- Per-channel/stream settings — requires channel-keyed storage namespace; correct stepping stone is a preset system

### Architecture Approach

The existing architecture has six cleanly bounded layers (Content Script → Background SW → Sidebar UI → WASM Engine, plus LLM Adapter, Storage Layer, and Options Page). All three improvements are confined to at most two layers each and require no new inter-layer communication patterns. See `.planning/research/ARCHITECTURE.md` for full detail.

**Major components and which improvement touches each:**

1. **`extension/sidebar/utils/DOMHelpers.js`** — replace regex allowlist with `DOMPurify.sanitize()`; migrate ~20 `innerHTML` assignments in `sidebar.js` to the new helper
2. **`extension/sidebar/sidebar.js` + `extension/sidebar/modules/StateManager.js`** — raise `MAX_MESSAGES` from 100 to 500 in both files (two separate constants); read `inactivityTimeout` and `analysisWindowSize` from settings instead of hardcoded constants
3. **`extension/options/options.js` + `options.html`** — add two new range sliders for `analysisWindowSize` (50–1000, default 500) and `inactivityTimeout` (30–600s, default 120); confirm `duplicateWindow` is already wired (currently a gap in the WASM call site)
4. **`wasm-engine/.cargo/config.toml`** (new file, optional) — set `--initial-memory=2097152` (2 MiB) to eliminate the one grow event that occurs at first 500-message analysis call; profile before applying

**Key architectural constraint:** `DEFAULT_SETTINGS` is defined in three separate places (`sidebar.js` line 13, `StateManager.js` line 267, `options.js` line 3). No shared constants module exists. Every new threshold field must be added to all three files. This is the single most fragile part of the architecture for this milestone.

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full detail (14 pitfalls across three domains).

1. **`DEFAULT_SETTINGS` defined in three places — silent divergence** — Adding a new threshold to `sidebar.js` but forgetting `StateManager.js` or `options.js` produces no error; the missing copy uses a stale default. Audit before adding any new field: grep all three files for the constant and update all three simultaneously.

2. **DOMPurify classic script loaded after ES module** — `sidebar.js` is `type="module"` (deferred). If `purify.min.js` appears after the module script tag in `sidebar.html`, `window.DOMPurify` is undefined at first sanitize call. Place the `<script src>` tag before the module tag. Post-migration: `grep -n 'innerHTML' extension/sidebar/sidebar.js` must return zero results.

3. **`parseInt("")` returns `NaN`, passes `typeof number` check** — If a user clears an options input field, `parseInt("", 10)` produces `NaN`; `typeof NaN === 'number'` passes the existing `validateSettings()` check; `NaN` coerces to `0` in WASM (`usize`), causing every word to appear as a topic or disabling spam filtering. Fix: use `Number.isFinite()` instead of `typeof x === 'number'` in all numeric threshold validation.

4. **Three separate `MAX_MESSAGES` / buffer accumulation paths** — `MAX_MESSAGES` appears independently in `sidebar.js` (line 681), `StateManager.js` (line 51), and session questions cap (line 95). Raising only the first produces inconsistent analysis window vs. session stats. Grep for the literal value `100` across the entire extension before changing any buffer constant.

5. **Accidental `manifest.json` edit removes `wasm-unsafe-eval`** — DOMPurify requires no CSP change. The reflex to touch the manifest during a security-related change can accidentally remove `wasm-unsafe-eval` from `extension_pages`, breaking WASM initialization silently. Do not touch `manifest.json` during the DOMPurify integration; reload the unpacked extension after any manifest change and verify no errors in `chrome://extensions`.

## Implications for Roadmap

Based on combined research, three phases match the three independent improvements. Each is independently testable and deployable. The ordering reflects: build artifact first, then sidebar-only changes, then settings pipeline completion.

### Phase 1: WASM Memory and Buffer Size

**Rationale:** The one improvement that requires a build step (`./scripts/build.sh`). Completing it first produces the rebuilt `.wasm` binary artifact that subsequent manual testing depends on. If profiling shows the default auto-grow is adequate at 500 messages (likely), the `.cargo/config.toml` change can be skipped and this phase reduces to changing one constant in `sidebar.js` and one in `StateManager.js`.

**Delivers:** `MAX_MESSAGES` raised from 100 to 500 in all accumulation paths; `analysisWindowSize` key added to `DEFAULT_SETTINGS` in all three locations; optional WASM initial memory set to 2 MiB.

**Addresses:** Analysis quality improvement for medium/large streams; exposes `analysisWindowSize` as a configurable setting (wired to `StateManager`, displayed in options page as labeled presets).

**Avoids:** Pitfall 2.3 (three separate accumulation paths); Pitfall 2.1 (confusing JS buffer cap with WASM memory); Pitfall 2.2 (profile serde cost before assuming 5x data increase is free).

### Phase 2: DOMPurify Integration

**Rationale:** Purely additive to the sidebar layer with no build step and no dependency on Phase 1. Can be done in isolation. The ~20 `innerHTML` assignments in `sidebar.js` represent an existing XSS risk from WASM-originated strings; closing this risk is independent of any settings work.

**Delivers:** `extension/libs/dompurify/purify.min.js` vendored; `DOMHelpers.safeSetHTML()` replaced with `DOMPurify.sanitize()`; all `innerHTML` assignments in sidebar migrated to the centralized helper; zero direct `innerHTML` usages remaining in sidebar JS.

**Addresses:** XSS defense for WASM-originated strings (topic terms, cluster card content, history card builders at lines ~441, ~1118, ~1184, ~1194 are the highest-risk sites).

**Avoids:** Pitfall 1.1 (verify no `new Function` in downloaded build); Pitfall 1.3 (script tag order in sidebar.html); Pitfall 1.4 (template literal innerHTML sites missed); Pitfall 1.5 (do not touch manifest.json).

### Phase 3: Configurable Thresholds — Wire Remaining Constants

**Rationale:** Depends on the settings infrastructure being confirmed solid (Phases 1 and 2 will exercise it). This phase has the highest pitfall density around input validation and DEFAULT_SETTINGS synchronization. Completing it last means the existing settings machinery is well-exercised before new fields are added.

**Delivers:** `inactivityTimeout` exposed as a settings field (range slider 30–600s, default 120s); both `sidebar.js` and `StateManager.js` read timeout from settings instead of hardcoded constant; `duplicateWindow` gap fixed (WASM call site wired to `settings.duplicateWindow * 1000`); `Number.isFinite()` validation replacing `typeof` checks in `ValidationHelpers.js`; cross-validation warning when `topicMinCount > analysisWindowSize * 0.3`.

**Addresses:** Inactivity timeout false positives during BRB screens; `duplicateWindow` settings gap (currently defined in options but not passed to WASM).

**Avoids:** Pitfall 3.1 (`parseInt` NaN validation); Pitfall 3.2 (HTML5 min/max bypassed); Pitfall 3.3 (interdependent threshold cross-validation); Pitfall 3.4 (DEFAULT_SETTINGS in three places — update all three).

### Phase Ordering Rationale

- Phase 1 contains the only build step; completing it first means subsequent testing uses the final binary artifact.
- Phase 2 is the most contained change (sidebar document only, no chrome APIs, no settings) — best to isolate it and confirm security posture before touching the settings pipeline.
- Phase 3 has the most validation logic and the most cross-file coordination (three DEFAULT_SETTINGS copies); doing it last means the team has exercised both the build system and the settings flow before adding new fields.
- All three phases are independent enough that they could be worked in parallel by separate developers if needed; the ordering is a recommendation, not a hard dependency.

### Research Flags

Phases with standard, well-documented patterns (no additional research needed):

- **Phase 1:** WASM buffer sizing is O(n) and the math is confirmed. The only open question is whether to pre-configure initial memory — profile first with `console.time`, apply `.cargo/config.toml` only if latency is measurable.
- **Phase 2:** DOMPurify integration pattern is fully documented. The migration is mechanical (grep + replace).
- **Phase 3:** chrome.storage.sync settings pipeline is already implemented end-to-end. Adding fields follows an established, working pattern.

No phase requires `/gsd:research-phase` during planning. All implementation details are resolved in the research files.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | DOMPurify version and integration pattern confirmed against official sources; chrome.storage.sync patterns match Chrome documentation; serde-wasm-bindgen serialization cost confirmed against wasm-bindgen issue tracker |
| Features | HIGH | Market research confirms sparse competitor landscape; table stakes vs. differentiator distinction is well-reasoned; anti-features are explicitly justified with implementation cost analysis |
| Architecture | HIGH | Research traces specific line numbers in existing codebase files; component boundaries are verified against actual code structure; the `duplicateWindow` gap was identified precisely |
| Pitfalls | HIGH | All 14 pitfalls grounded in specific code locations, Chrome documentation, or wasm-bindgen issue history; no speculative risks |

**Overall confidence: HIGH**

### Gaps to Address

- **`duplicateWindow` options page audit:** ARCHITECTURE.md identifies that `duplicateWindow` may already have a slider in `options.html` but this has not been confirmed by reading the file. Verify during Phase 3 implementation whether the slider exists or needs to be added.
- **`analysisWindowSize` UX presentation:** FEATURES.md recommends labeled presets ("Small stream / Medium / Large") rather than a raw number slider to prevent users from creating configurations where topics can never appear. The exact preset breakpoints (e.g., 50 / 200 / 500 messages) should be decided during Phase 1 planning rather than left to implementation.
- **Profiling baseline:** Neither the serde serialization cost at 500 messages nor the grow-overhead at the first large batch has been measured against this specific machine/Chrome version. The research predicts both are acceptable, but a 5-minute `console.time` profiling pass before committing the buffer increase would confirm this.

## Sources

### Primary (HIGH confidence)

- [DOMPurify GitHub — cure53/DOMPurify](https://github.com/cure53/DOMPurify) — version history, eval dependency resolution
- [DOMPurify Issue #249 — unsafe-eval CSP](https://github.com/cure53/DOMPurify/issues/249) — MV3 compatibility confirmation
- [Chrome Extensions — Content Security Policy (MV3)](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — CSP directive structure
- [chrome.storage API reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — sync quotas, onChanged behavior
- [serde-wasm-bindgen docs.rs](https://docs.rs/serde-wasm-bindgen/latest/serde_wasm_bindgen/) — serialization cost characteristics

### Secondary (MEDIUM confidence)

- [Chat Analyzer: Track Twitch, YouTube & Kick — Streams Charts](https://streamscharts.com/tools/chat-analyzer) — competitive landscape
- [Real-time Twitch chat sentiment analysis with Apache Flink — Towards Data Science](https://towardsdatascience.com/real-time-twitch-chat-sentiment-analysis-with-apache-flink-e165ac1a8dcf/) — windowing patterns
- [Idle Session Timeout Best Practice — TIMIFY](https://blog.timify.com/session-timeout-set-up-best-practice-protection-with-timify/) — inactivity timeout conventions
- [OWASP Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html) — extension-specific XSS risks

### Tertiary (context)

- [wasm-bindgen Issue #2539 — JsValue::from_serde performance](https://github.com/rustwasm/wasm-bindgen/issues/2539) — serde_wasm_bindgen vs. legacy serde path comparison
- [V8 Blog — Up to 4GB of memory in WebAssembly](https://v8.dev/blog/4gb-wasm-memory) — WASM memory growth behavior

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
