---
phase: 10-semantic-cosine-routing
plan: 01
subsystem: ui
tags: [cosine-similarity, semantic-routing, wasm, transformers, webgpu, prototype-vectors]

# Dependency graph
requires:
  - phase: 08-encoder-foundation
    provides: encodeMessages() returning L2-normalized 384-dim arrays via Transformers.js pipeline

provides:
  - routing-config.js with ROUTING_CONFIG (seed phrases + per-category thresholds + defaultLabel + wasmSpeedThresholdMsPerMessage)
  - cosine-router.js with buildPrototypes(), classifyMessage(), classifyBatch(), isSemanticReady(), setSemanticMode(), setKeywordMode(), getMode()
  - encoder-adapter.js flushQueue callback now includes durationMs (inference time only)

affects:
  - 10-02 (will wire cosine-router.js and routing-config.js into sidebar.js)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Prototype cosine routing — encode seed phrases once, compute L2-normalized centroid per category, classify via dot product argmax
    - General Chat as implicit default — iterate only named categories in argmax; below-threshold messages unconditionally route to defaultLabel
    - L2-normalize centroid after averaging — centroid of normalized vectors is not normalized (Pitfall 1 guard)
    - durationMs in batch callback — inference time measured inside flushQueue wrapping encodeMessages(), not queue wait time

key-files:
  created:
    - extension/sidebar/routing-config.js
    - extension/sidebar/cosine-router.js
  modified:
    - extension/sidebar/encoder-adapter.js

key-decisions:
  - "Threshold 0.30 (not 0.35) for all three named categories — stream chat is noisier than literature domain (support tickets); lower starting threshold reduces General Chat over-routing"
  - "General Chat excluded from ROUTING_CONFIG.categories array — only listed in defaultLabel; prevents General Chat prototype from competing with named categories in argmax"
  - "durationMs added as third argument to onBatchReady callback — backward-compatible, measures encodeMessages() inference time only, not queue wait time"
  - "_prototypeVectors NOT cleared on setKeywordMode() — allows re-enablement via setSemanticMode() if encoder recovers without rebuilding prototypes"

patterns-established:
  - "Pure math module pattern: cosine-router.js has no DOM access or chrome.* APIs — standalone, testable, portable"
  - "Config-driven tuning: all seed phrases and thresholds in routing-config.js — one-line changes per category without touching logic"

requirements-completed: [CLU-01, CLU-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 10 Plan 01: Semantic Cosine Routing - Core Modules Summary

**Cosine similarity routing module (cosine-router.js) with L2-normalized prototype vectors from seed phrase embeddings, config file (routing-config.js) with 3 categories at 0.30 threshold, and durationMs timing added to encoder-adapter flushQueue callback**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T20:49:43Z
- **Completed:** 2026-02-20T20:51:49Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `routing-config.js` — static ES module with `ROUTING_CONFIG` containing seed phrases for Questions, Issues/Bugs, and Requests (5 phrases each at 0.30 threshold), General Chat as `defaultLabel`, and `wasmSpeedThresholdMsPerMessage: 200`
- Created `cosine-router.js` — pure math module with `buildPrototypes()` (single-batch seed phrase encoding + L2-normalized centroid per category), `classifyMessage()` (argmax dot product with below-threshold defaulting to General Chat), `classifyBatch()`, and mode state management (`isSemanticReady`, `setSemanticMode`, `setKeywordMode`, `getMode`)
- Updated `encoder-adapter.js` — `flushQueue` now measures inference time and passes `durationMs` as third argument to `onBatchReady(batch, embeddings, durationMs)`, enabling callers to detect slow WASM encoding for fallback decisions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routing-config.js and cosine-router.js** - `fe87e50` (feat)
2. **Task 2: Add durationMs timing to encoder-adapter.js flushQueue callback** - `cbb9e6e` (feat)

**Plan metadata:** [pending final docs commit]

## Files Created/Modified

- `extension/sidebar/routing-config.js` — ROUTING_CONFIG with 3 named categories (Questions, Issues/Bugs, Requests) at threshold 0.30, defaultLabel='General Chat', wasmSpeedThresholdMsPerMessage=200
- `extension/sidebar/cosine-router.js` — standalone cosine routing: buildPrototypes(), classifyMessage(), classifyBatch(), isSemanticReady(), setSemanticMode(), setKeywordMode(), getMode(); L2-normalizes centroids; no DOM or chrome.* APIs
- `extension/sidebar/encoder-adapter.js` — flushQueue callback signature extended from (batch, embeddings) to (batch, embeddings, durationMs); backward-compatible

## Decisions Made

- Threshold **0.30** (not 0.35 from requirements) — stream chat is noisier than support ticket literature domain; starting lower reduces General Chat over-routing and allows upward calibration
- **General Chat excluded from categories array** — it is the `defaultLabel` only; named categories are iterated in argmax, and below-threshold messages unconditionally route to General Chat (Pitfall 4 guard from research)
- **_prototypeVectors NOT cleared on setKeywordMode()** — if the encoder recovers after a gpu-unavailable event, setSemanticMode() re-enables routing without re-encoding seed phrases; preserves cache-hit benefit
- **durationMs measured inside flushQueue wrapping encodeMessages()** — measures GPU/WASM inference time only, not queue wait time (Pitfall 5 guard from research)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `routing-config.js` and `cosine-router.js` are ready for Plan 02 to import and wire into `sidebar.js`
- `encoder-adapter.js` now provides `durationMs` for the speed-threshold fallback logic Plan 02 will implement
- Plan 02 will add: badge DOM element in sidebar.html, badge CSS in sidebar.css, `buildPrototypes()` call after encoder ready, `classifyBatch()` in scheduleEncode callback, and gpu-unavailable handler updates

---
*Phase: 10-semantic-cosine-routing*
*Completed: 2026-02-20*
