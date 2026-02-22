---
phase: 11-qwen-slm-swap
plan: 02
subsystem: ui
tags: [chrome-extension, sidebar, fallback-ui, llm, css-variables]

# Dependency graph
requires:
  - phase: 11-01
    provides: isInFallback() and retryLLM() exports from llm-adapter.js, garbage-triggered fallback state

provides:
  - Fallback notice HTML element (#ai-fallback-notice) with "Basic mode" label and "Retry AI" button
  - CSS styling for .ai-fallback-notice and .btn-link using project CSS variables
  - updateFallbackNotice() helper toggling visibility based on isInFallback() state
  - retryAiBtn click handler calling retryLLM() with generic progress text
  - Fallback notice hidden on session reset and non-live view switches

affects: [11-qwen-slm-swap, sidebar-ui, llm-adapter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - updateFallbackNotice() pattern: central helper function for all fallback state synchronization
    - btn-link CSS class: reusable text-style button using CSS variables (no hardcoded colors)

key-files:
  created: []
  modified:
    - extension/sidebar/sidebar.html
    - extension/sidebar/sidebar.css
    - extension/sidebar/sidebar.js

key-decisions:
  - "updateFallbackNotice() called in three sites: after generateAISummary() try+catch, after analyzeSentiment() in updateMoodIndicator(), and after retryLLM() in retry handler — covers all LLM state transitions"
  - "Fallback notice hidden (not removed) on session reset and history view — allows updateFallbackNotice() to restore correct state on live view return"
  - "Generic progress text 'Loading AI: N%' already existed — no change needed, no model names exposed"

patterns-established:
  - "isInFallback() polling pattern: call after any LLM operation that may transition fallback state"

requirements-completed: [SLM-01, SLM-03]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 11 Plan 02: Qwen SLM Swap — Fallback UI Summary

**"Basic mode" indicator + "Retry AI" button wired to isInFallback()/retryLLM() in sidebar, with CSS-variable theming and no model names exposed to users**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T22:27:22Z
- **Completed:** 2026-02-20T22:29:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added #ai-fallback-notice div (hidden by default) with "Basic mode" italic label and "Retry AI" btn-link button, positioned between #ai-summary and #clusters-header in sidebar.html
- Added .ai-fallback-notice, .fallback-label, .fallback-separator, .btn-link CSS classes using --text-muted and --accent-color variables (dark/light theme support inherited)
- Extended llm-adapter.js import to include isInFallback and retryLLM; added fallbackNotice and retryAiBtn DOM references
- Added updateFallbackNotice() helper called at all three LLM state-change points; retryAiBtn handler re-initializes engine with generic progress text
- Fallback notice correctly hidden on startNewSession() and switchToView('history'), restored on switchToView('live')

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fallback notice HTML, CSS, and sidebar.js imports** - `d3e3007` (feat)
2. **Task 2: Wire fallback visibility toggling and retry button** - `95efe34` (feat)

**Plan metadata:** (docs commit, see final commit)

## Files Created/Modified
- `extension/sidebar/sidebar.html` - Added #ai-fallback-notice div with "Basic mode" label and "Retry AI" btn-link button
- `extension/sidebar/sidebar.css` - Added .ai-fallback-notice, .fallback-label, .fallback-separator, .btn-link styles using CSS variables
- `extension/sidebar/sidebar.js` - Extended import, added DOM refs, updateFallbackNotice(), retryAiBtn handler, session reset + view switch integration

## Decisions Made
- updateFallbackNotice() called at three call sites (generateAISummary try/catch + analyzeSentiment path + retry handler) to cover all LLM state transitions
- Fallback notice hidden via classList in startNewSession() alongside other UI elements; updateFallbackNotice() used for live view return to restore correct state
- Verified generic progress text already in place in startLLMInitialization() — no change needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 11 complete: Qwen2.5-0.5B model swap, keyword-scan parser, garbage fallback, isInFallback/retryLLM exports, and fallback UI all shipped
- Phase 12 readiness: full semantic AI pipeline is in place (MiniLM encoder + cosine router + Qwen summarizer with fallback UI)
- Remaining: verification and CWS submission (Phase 12)

---
*Phase: 11-qwen-slm-swap*
*Completed: 2026-02-20*
