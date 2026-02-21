# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Real-time chat analysis must be accurate enough to be actionable — semantic clustering via encoder vectors replaces keyword matching for dramatically better message classification accuracy.
**Current focus:** v1.2 Semantic AI Pipeline — Phase 12: Integration and Hardening (1/? plans done). WASM gate fix, encoder status text, and Qwen auto-retry landed.

## Current Position

Phase: 12 of 12 (Integration and Hardening) — IN PROGRESS
Plan: 1 of ? complete in current phase
Status: 12-01 complete — WASM gate fixed (clusters render during encoder download), encoder status text (warm/cold), miniLMCached flag, Qwen auto-retry with 60s cooldown.
Last activity: 2026-02-21 — 12-01-PLAN.md complete (WASM rendering gate fix, encoder status text lifecycle, warm-start detection, Qwen auto-retry)

Progress: [████░░░░░░] ~50% (v1.2, 9/16 plans complete)

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 7
- Average duration per plan: ~1.9 min

**v1.1 Velocity:**
- Total plans completed: 6
- 04-01: ~23 min — 5 tasks, 5 files (privacy policy, CNAME, CWS justifications)
- 04-02: ~3 min — 2 tasks, 0 files (verification-only, human-action + auto)
- 05-01: ~1 min — 2 tasks, 2 files (manifest audit, CSP rationale)
- 05-02: ~2 min — 2 tasks, 3 files (consent modal disclosure, storage check)
- 06-01: ~2 min — 2 tasks, 4 files (store listing copy, promo image, npm deps)
- 06-02: ~4 min — 2 tasks, 4 files (Playwright screenshot script + three 1280x800 PNGs)

**v1.2 Velocity:**
- Total plans completed: 8
- 08-01: ~3 min — 2 tasks, 5 files (Transformers.js vendoring, encoder-adapter.js)
- 08-02: ~5 min — 2 tasks, 5 files (sidebar encoder progress bar, analysis gating, settings backend info)
- 09-01: ~2 min — 2 tasks, 3 files (GPU scheduler module, encoder-adapter wiring, sidebar event listener)
- 10-01: ~2 min — 2 tasks, 3 files (routing-config.js, cosine-router.js, encoder-adapter durationMs)
- 10-02: ~2 min — 2 tasks, 3 files (cosine router wired into sidebar.js, clustering mode badge, semantic bucket rendering)
- 11-01: ~2 min — 2 tasks, 1 file (Qwen2.5-0.5B swap, keyword-scan parser, garbage fallback, isInFallback/retryLLM exports)
- 11-02: ~2 min — 2 tasks, 3 files (Basic mode indicator, Retry AI button, updateFallbackNotice(), view/session reset integration)
- 12-01: ~2 min — 2 tasks, 4 files (WASM gate fix, encoder status text, warm-start detection, Qwen auto-retry with 60s cooldown)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log.

Recent decisions affecting v1.2:
- Encode in sidebar page context (not background.js) — WebGPU unavailable in MV3 service workers
- Prototype cosine routing over K-Means/DBSCAN — deterministic, O(n×4), maps to fixed 4-bucket UI
- MiniLM auto-loads without consent (~25MB) — Qwen remains consent-gated (~950MB combined)
- GPU scheduler built before either WebGPU model is active — prevents device loss or OOM

Decisions from 08-01 execution:
- Glob-based vendor script avoids file-list staleness after Transformers.js upgrades
- wasmPaths set at module level (before function definitions) — mandatory for MV3 CSP compliance
- WebGPU detection with manual WASM fallback (Transformers.js v3 does not auto-fallback)
- initEncoderWithRetry resets state+promise between retries so initEncoder runs fresh
- TIME_FLUSH_MS=8000 chosen for slow chat tolerance (range noted: 5-10s)

Decisions from 08-02 execution:
- encoderReady + getEncoderState() === 'loading' gate prevents analysis rendering during model download; falls through on error for WASM fallback
- allMessages module-level buffer used for catch-up encoding (StateManager.js is dormant in sidebar.js)
- Encoder init is fire-and-forget (no await) in initWasm() — WASM analysis works immediately
- Options page reads encoderBackend from chrome.storage.local (not sync) — backend is device-specific

Decisions from 09-01 execution:
- GPU scheduler built as hand-rolled promise-chain mutex (no npm dependency needed for two task types)
- MAX_QUEUE_DEPTH=8 (mid-range 5-10), ENCODER_BURST_LIMIT=4 (4:1 ratio), AUDIT_SIZE=20 ring buffer
- scheduleGpuTask wraps only pipeline inference calls, not pipeline creation or cache operations
- registerDevice() requests a second GPUDevice reference solely for device.lost watcher (Transformers.js holds primary device internally)
- gpu-unavailable listener in sidebar.js sets encoderReady=false — analysis gate falls through to WASM-only mode, no UI indicator needed
- [Phase 10-semantic-cosine-routing]: Threshold 0.30 (not 0.35) for all named categories — stream chat is noisier than literature domain (support tickets)
- [Phase 10-semantic-cosine-routing]: General Chat excluded from ROUTING_CONFIG.categories array — only listed in defaultLabel; prevents General Chat prototype from competing in argmax
- [Phase 10-semantic-cosine-routing]: _prototypeVectors NOT cleared on setKeywordMode() — allows re-enablement via setSemanticMode() if encoder recovers without rebuilding prototypes
- [Phase 10-02]: WASM renders clusters synchronously for immediate display; async scheduleEncode callback overwrites with cosine buckets when embeddings arrive — prevents blank display while waiting for encoder
- [Phase 10-02]: clusters-header starts hidden and is revealed by processMessages() on first analysis render, mirroring the existing clusters section lifecycle
- [Phase 10-02]: setKeywordMode() and badge update applied in both gpu-unavailable handler (permanent GPU loss) and slow-encoding path (WASM speed threshold exceeded) — two separate fallback triggers

Decisions from 11-01 execution:
- Keyword-scan parser (response.match(/MOOD:/i)) replaces line-position parser (startsWith) to handle Qwen2.5 conversational preamble
- Garbage detection: mood=neutral AND confidence=0.5 AND summary='' identifies silent fallback result — specific sentinel values make detection unambiguous
- _garbageCount resets to 0 only on successful parse — 2 failures must be consecutive to trigger session fallback (locked decision)
- hasSummaryFormat() uses /\S.*:\s*\S/ pattern — permissive enough to match emoji+category lines without requiring a specific emoji regex
- retryLLM() performs full engine reload (not state-only reset) — relies on IndexedDB cache for fast ~2-5s re-init (locked decision)

Decisions from 11-02 execution:
- updateFallbackNotice() called at three sites: generateAISummary try+catch, analyzeSentiment path in updateMoodIndicator, retryAiBtn handler — covers all LLM state transitions
- Fallback notice hidden via classList in startNewSession() and switchToView('history'); updateFallbackNotice() restores correct state on live view return
- Generic progress text 'Loading AI: N%' already in place — no model name exposed

Decisions from 12-01 execution:
- encoderLoading flag replaces early-return gate: WASM clusters render during encoder download; only scheduleEncode is skipped (encoder not ready for embeddings)
- wasRealEngine = engine && !engine._isFallback captured before fallback switch: auto-retry only fires for real Qwen garbage, not missing-bundle fallback
- miniLMCached stored in chrome.storage.local (device-specific, not sync): warm start shows 'Restoring semantic engine...' vs cold 'Loading semantic engine...'
- Status text hidden in two places: after initEncoderWithRetry resolves AND in onError 'unavailable' branch to cover both success and final failure paths

### Pending Todos

None.

### Blockers/Concerns

- Phase 10 gate: cosine threshold started at 0.30 (below literature 0.35) — stream chat is noisier; needs calibration against live stream chat after Plan 02 wires routing into sidebar
- Phase 11 gate (CLEARED): Qwen2.5-0.5B-Instruct-q4f16_1-MLC confirmed in vendored bundle — model swap complete in 11-01
- Phase 11: Qwen2.5-0.5B structured output reliability is LOW confidence until 20+ real outputs validated — keyword-scan parser + garbage fallback mitigate this
- sidePanel incognito behavior is MEDIUM confidence — deferred VERIF-01 from v1.1, still pending

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 12-01-PLAN.md (WASM gate fix, encoder status text, warm-start detection, Qwen auto-retry). Phase 12 in progress (1/? plans done).
Resume file: None
