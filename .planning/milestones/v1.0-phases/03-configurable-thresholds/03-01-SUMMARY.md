---
phase: 03-configurable-thresholds
plan: 01
subsystem: ui
tags: [chrome-extension, settings, inactivity-detection, validation]

# Dependency graph
requires:
  - phase: 01-analysis-window
    provides: analysisWindowSize slider pattern and options.js wiring pipeline
  - phase: 02-dompurify-integration
    provides: safe DOM helpers, XSS-protected sidebar.js
provides:
  - Inactivity timeout slider in options page (30-600s, default 120s, step 30s)
  - inactivityTimeout in all three DEFAULT_SETTINGS copies
  - Live settings reads replacing hardcoded INACTIVITY_TIMEOUT constants
  - validateSettings() guard for inactivityTimeout
  - duplicateWindow confirmed wired to both WASM call sites (THR-02)
affects: [03-02-PLAN.md, future threshold plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - || fallback pattern on settings reads before settings load completes
    - "* 1000 conversion: store seconds in settings, convert to ms at read sites"
    - undefined guard on optional settings fields for backward compatibility with legacy settings objects

key-files:
  created: []
  modified:
    - extension/options/options.html
    - extension/options/options.js
    - extension/sidebar/sidebar.js
    - extension/sidebar/modules/StateManager.js
    - extension/sidebar/modules/SessionManager.js
    - extension/sidebar/utils/ValidationHelpers.js

key-decisions:
  - "Display raw seconds in options UI (e.g. '120s') not human-readable minutes"
  - "|| 120 fallback on settings.inactivityTimeout guards startup race before settings load"
  - "inactivityTimeout stored as seconds in settings, converted to ms at read site (* 1000)"
  - "Change takes effect immediately on next message batch — no timer restart needed"
  - "THR-02 (duplicateWindow wiring) confirmed pre-existing at both analyze_chat_with_settings call sites, no code change needed"

patterns-established:
  - "undefined guard pattern: if (settings.X !== undefined) { validate } — tolerates settings saved before this field existed"
  - "Fallback || default pattern: (settings.X || defaultValue) * unit — guards startup race"

requirements-completed: [THR-01, THR-02]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 03 Plan 01: Add Inactivity Timeout Setting Summary

**Inactivity timeout exposed as user-configurable 30-600s slider in options page, replacing the hardcoded 120s constant in sidebar.js and SessionManager.js, with duplicateWindow confirmed wired to both WASM call sites**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T21:55:36Z
- **Completed:** 2026-02-19T21:57:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added inactivity timeout slider to options page Spam Detection section (min=30, max=600, step=30, default=120, display in raw seconds)
- Added `inactivityTimeout: 120` to all three DEFAULT_SETTINGS copies (options.js, sidebar.js, StateManager.js)
- Removed `INACTIVITY_TIMEOUT = 120000` constant from sidebar.js and `INACTIVITY_TIMEOUT = 120000` property from StateManager.js
- Both inactivity check functions now read `settings.inactivityTimeout` (sidebar.js) and `stateManager.settings.inactivityTimeout` (SessionManager.js) with `|| 120` fallback and `* 1000` ms conversion
- Added `inactivityTimeout` validation rule to ValidationHelpers.js with `Number.isFinite` guard and undefined check for legacy settings compatibility
- Confirmed duplicateWindow wiring at both `analyze_chat_with_settings` call sites (lines 311 and 685 in sidebar.js) — THR-02 was pre-existing, no change needed
- All 18 Rust unit tests pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add inactivityTimeout to all DEFAULT_SETTINGS and options UI** - `020a0cf` (feat)
2. **Task 2: Replace hardcoded INACTIVITY_TIMEOUT constants with live settings reads** - `be24dd1` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `extension/options/options.html` - Added inactivity-timeout range slider row in Spam Detection section
- `extension/options/options.js` - Added inactivityTimeout to DEFAULT_SETTINGS, inputs, displays, updateDisplays, setInputValues, getInputValues
- `extension/sidebar/sidebar.js` - Added inactivityTimeout to DEFAULT_SETTINGS; removed INACTIVITY_TIMEOUT constant; startInactivityCheck() reads settings.inactivityTimeout
- `extension/sidebar/modules/StateManager.js` - Added inactivityTimeout to DEFAULT_SETTINGS; removed INACTIVITY_TIMEOUT property
- `extension/sidebar/modules/SessionManager.js` - startInactivityCheck() reads stateManager.settings.inactivityTimeout
- `extension/sidebar/utils/ValidationHelpers.js` - Added inactivityTimeout validation with Number.isFinite guard (30-600s)

## Decisions Made
- Display raw seconds with "s" suffix (e.g., "120s") — consistent with duplicateWindow display pattern, simpler than human-readable minutes
- `|| 120` fallback guards the startup race condition between settings loading and first message batch — same pattern as `|| 500` for analysisWindowSize
- Store seconds in settings, convert to milliseconds at the read site (`* 1000`) — settings are human-readable, internals use ms
- inactivityTimeout change takes effect immediately on next interval check — no timer restart required since the interval re-reads the value each tick

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 03 Plan 01 complete. Phase 03 Plan 02 can begin.
- All threshold settings from Phase 3 research are now addressed: analysisWindowSize (01-01/01-02), duplicateWindow (confirmed wired), inactivityTimeout (this plan).
- The remaining plan (03-02) handles sentimentSensitivity and moodUpgradeThreshold wiring.

---
*Phase: 03-configurable-thresholds*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: extension/options/options.html
- FOUND: extension/options/options.js
- FOUND: extension/sidebar/sidebar.js
- FOUND: extension/sidebar/modules/StateManager.js
- FOUND: extension/sidebar/modules/SessionManager.js
- FOUND: extension/sidebar/utils/ValidationHelpers.js
- FOUND: .planning/phases/03-configurable-thresholds/03-01-SUMMARY.md
- FOUND commit: 020a0cf (Task 1)
- FOUND commit: be24dd1 (Task 2)
