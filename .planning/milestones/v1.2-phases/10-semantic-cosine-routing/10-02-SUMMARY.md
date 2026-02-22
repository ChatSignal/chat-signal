---
phase: 10-semantic-cosine-routing
plan: 02
subsystem: ui
tags: [cosine-similarity, semantic-routing, transformers-js, webgpu, clustering, badge]

# Dependency graph
requires:
  - phase: 10-01
    provides: cosine-router.js with buildPrototypes/classifyBatch/isSemanticReady/setSemanticMode/setKeywordMode, routing-config.js with ROUTING_CONFIG.categories and wasmSpeedThresholdMsPerMessage

provides:
  - Clustering mode badge ("Semantic"/"Keyword") in sidebar UI showing which routing is active
  - Cosine routing wired into sidebar.js analysis pipeline via scheduleEncode callback
  - buildSemanticBuckets() helper for assembling bucket objects from cosine labels
  - Prototype building triggered after encoder-ready (buildPrototypes() + setSemanticMode())
  - Silent fallback to keyword mode on gpu-unavailable event or slow WASM encoding
  - clusters-header visibility managed alongside clustersDiv in all view transitions

affects: [11-qwen-summarization, phase-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WASM renders buckets synchronously for immediate display; async scheduleEncode callback overwrites with cosine buckets when embeddings arrive (no flicker on first render)
    - Badge-only UI indicator: plain text "Semantic"/"Keyword" — no color, no toast, no modal for mode changes
    - Silent automatic mode switching — user never manually controls clustering mode

key-files:
  created: []
  modified:
    - extension/sidebar/sidebar.html
    - extension/sidebar/sidebar.css
    - extension/sidebar/sidebar.js

key-decisions:
  - "WASM renders clusters immediately (synchronous), cosine routing overwrites async via scheduleEncode callback — prevents blank display while waiting for embeddings"
  - "clusters-header hidden by default (starts with class='hidden'), shown when processMessages() first renders clusters — mirrors existing clustersDiv lifecycle"
  - "setKeywordMode() called in both gpu-unavailable handler and slow-encoding path — two separate fallback triggers for the same downgrade"

patterns-established:
  - "Encoder-timing-based fallback: durationMs from scheduleEncode callback enables per-batch speed check; >wasmSpeedThresholdMsPerMessage triggers keyword mode silently"
  - "No reclassification: switching from Keyword to Semantic (or back) never reclassifies existing messages — each batch classified under whichever mode is active when embeddings arrive"

requirements-completed: [CLU-01, CLU-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 10 Plan 02: Semantic Cosine Routing UI Summary

**Cosine routing wired into sidebar.js: "Semantic"/"Keyword" badge, prototype building after encoder-ready, scheduleEncode callback overrides WASM buckets with cosine-classified buckets on each analysis cycle**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T20:54:48Z
- **Completed:** 2026-02-20T20:57:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- clusters-header div and clustering-mode-badge span added to sidebar.html (starts "Keyword", hidden)
- CSS flex-row header layout and muted text badge style added to sidebar.css using CSS variables
- sidebar.js imports cosine-router.js and routing-config.js at module level
- After encoder-ready: buildPrototypes() -> setSemanticMode() -> badge updates to "Semantic"
- scheduleEncode callback now checks encoding speed and, if isSemanticReady(), calls classifyBatch() + buildSemanticBuckets() to override WASM bucket display
- Silent keyword-mode fallback on gpu-unavailable event and on slow encoding (>wasmSpeedThresholdMsPerMessage ms/msg)
- clusters-header visibility managed in startNewSession() and switchToView() alongside clustersDiv

## Task Commits

Each task was committed atomically:

1. **Task 1: Add badge HTML and CSS for clustering mode indicator** - `b74d52b` (feat)
2. **Task 2: Wire cosine router into sidebar.js analysis pipeline** - `043216b` (feat)

**Plan metadata:** committed with final docs commit

## Files Created/Modified
- `extension/sidebar/sidebar.html` - Added clusters-header div with h3 title and mode badge span before clusters div
- `extension/sidebar/sidebar.css` - Added .clusters-header (flex layout) and .clustering-mode-badge (muted text) styles using CSS variables
- `extension/sidebar/sidebar.js` - Added cosine router imports, DOM refs, badge helper, prototype building, scheduleEncode cosine routing, buildSemanticBuckets(), show/hide header logic

## Decisions Made
- WASM renders clusters synchronously for immediate display; async scheduleEncode callback overwrites with cosine buckets when embeddings arrive — avoids blank display while waiting for encoder
- clusters-header starts hidden and is revealed by processMessages() on first analysis render, mirroring the existing clusters section lifecycle
- setKeywordMode() and badge update applied in both the gpu-unavailable handler (permanent GPU loss) and the slow-encoding path (WASM speed threshold exceeded) — two separate fallback triggers with identical outcome

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full cosine routing pipeline is now active end-to-end: encoder -> prototype vectors -> cosine similarity -> bucket display
- Threshold 0.30 is a starting point; calibration against live stream chat is needed after observing real-world classification accuracy (noted as Phase 10 gate in STATE.md)
- Phase 11 (Qwen summarization) can proceed; existing LLM adapter and AI summary pipeline are unaffected by this change

## Self-Check: PASSED
- FOUND: extension/sidebar/sidebar.html
- FOUND: extension/sidebar/sidebar.css
- FOUND: extension/sidebar/sidebar.js
- FOUND: .planning/phases/10-semantic-cosine-routing/10-02-SUMMARY.md
- FOUND: b74d52b (Task 1 commit)
- FOUND: 043216b (Task 2 commit)

---
*Phase: 10-semantic-cosine-routing*
*Completed: 2026-02-20*
