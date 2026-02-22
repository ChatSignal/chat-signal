---
phase: 08-encoder-foundation
plan: 02
subsystem: ui
tags: [transformers.js, encoder, webgpu, wasm, progress-bar, chrome-extension, mv3, sidebar]

# Dependency graph
requires:
  - phase: 08-01
    provides: encoder-adapter.js singleton with initEncoderWithRetry, scheduleEncode, getEncoderState, getBackendInfo
provides:
  - Stage-aware encoder progress bar in sidebar (Downloading → Initializing → Warming up → fade out)
  - Analysis section rendering gated on encoder readiness (hidden during loading, shown after ready or error fallback)
  - Message feeding into encoder batch queue after WASM analysis for Phase 10 cosine routing
  - Catch-up encoding of buffered messages after encoder becomes ready
  - Encoder backend info (WebGPU / WASM CPU) displayed in Settings page via chrome.storage.local
affects: [09-gpu-scheduler, 10-semantic-clustering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-blocking encoder init: initEncoderOnStartup() called without await in initWasm() — encoder loads in background while WASM analysis works immediately"
    - "Rendering gate: encoderReady flag + getEncoderState() === 'loading' combo prevents analysis UI flicker during loading, falls through on error"
    - "Catch-up encoding: allMessages buffer fed to scheduleEncode() immediately after encoderReady = true"
    - "Settings info via storage bridge: sidebar writes encoderBackend to chrome.storage.local; options.js reads it on load"

key-files:
  created: []
  modified:
    - extension/sidebar/sidebar.html
    - extension/sidebar/sidebar.css
    - extension/sidebar/sidebar.js
    - extension/options/options.html
    - extension/options/options.js

key-decisions:
  - "encoderReady flag combined with getEncoderState() === 'loading' used as rendering gate — avoids showing analysis before encoder is ready while allowing WASM fallback when encoder errors"
  - "allMessages (module-level buffer in sidebar.js) used for catch-up encoding — StateManager.js is a dormant module not used by sidebar.js, so direct variable access is correct"
  - "Encoder init is fire-and-forget (no await in initWasm): WASM analysis works immediately on first messages; encoder loads concurrently"
  - "Options page reads encoderBackend from chrome.storage.local (not sync) — backend info is device-specific, not a user setting"

patterns-established:
  - "Progress bar stages: initiate/download → 0%, progress events → event.progress%, done → 95%, ready → 99%, success → 100% fade out"
  - "Error path: encoderProgress.error class sets text red; 'unavailable' keyword triggers 4s display then 5s hide with fade-out"

requirements-completed: [ENC-02, ENC-03, ENC-04, ENC-05]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 8 Plan 02: Encoder Foundation — Sidebar Integration Summary

**MiniLM encoder wired into sidebar with stage-aware progress bar (Download/Initialize/Warmup), analysis rendering gated on encoder readiness, message batch queue feeding, and Settings page backend info display**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-20T15:00:00Z
- **Completed:** 2026-02-20T15:05:00Z
- **Tasks:** 2
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments
- Added slim encoder progress bar at top of sidebar container with stage text (Downloading model / Initializing encoder / Warming up) that fades out silently on success or shows brief error then hides on failure
- Gated analysis section rendering (mood, topics, clusters, AI summary) on `encoderReady` flag — sections stay hidden during encoder loading but appear immediately after encoder is ready or falls back on error
- Wired `scheduleEncode()` call after WASM analysis so messages are batched and encoded for Phase 10 cosine routing; catch-up pass encodes buffered `allMessages` after encoder becomes ready
- Settings page now shows "Encoder Info" section with "WebGPU" or "WASM (CPU)" read from `chrome.storage.local.encoderBackend`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add progress bar UI and wire sidebar.js to encoder lifecycle** - `245b92d` (feat)
2. **Task 2: Add encoder backend info to Settings page** - `c880bbf` (feat)

**Plan metadata:** (committed with final docs commit)

## Files Created/Modified
- `extension/sidebar/sidebar.html` — Added `#encoder-progress` div with progress bar and text span before `<header>`
- `extension/sidebar/sidebar.css` — Added `.encoder-progress`, `.encoder-progress-bar`, `.encoder-progress-fill`, `.encoder-progress-text`, `.encoder-progress.fade-out`, `.encoder-progress.error` styles using CSS variables
- `extension/sidebar/sidebar.js` — Imported encoder-adapter exports, added DOM refs + `encoderReady` flag, added `initEncoderOnStartup()`, non-blocking call in `initWasm()`, rendering gate in `processMessages()`, `scheduleEncode()` call after WASM analysis
- `extension/options/options.html` — Added "Encoder Info" section with `#encoder-backend-value` span
- `extension/options/options.js` — Added `loadEncoderInfo()` reading from `chrome.storage.local`; called alongside `loadSettings()` in DOMContentLoaded

## Decisions Made
- Used `allMessages` module-level variable for catch-up encoding (StateManager.js exists but is not actively used by sidebar.js — using it would require refactoring outside plan scope)
- Encoder init is fire-and-forget in `initWasm()` to keep WASM analysis working immediately without waiting 5-30s for model download
- `options.js` reads from `chrome.storage.local` (device-specific) not `chrome.storage.sync` — encoder backend selection is hardware-dependent, not a user preference to sync

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 10 (semantic clustering): `scheduleEncode()` is wired and producing embeddings — the `onBatchReady` callback stub logs batch info; Phase 10 replaces this with cosine routing logic
- Phase 9 (GPU scheduler): encoder successfully initializes on WebGPU when available; GPU scheduler can hook into encoder state via `getEncoderState()` / `getBackendInfo()`
- Settings page backend display works end-to-end: sidebar writes on success, options reads on open

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 08-encoder-foundation*
*Completed: 2026-02-20*
