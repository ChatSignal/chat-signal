---
phase: 01-analysis-window
plan: 01
subsystem: ui
tags: [chrome-extension, settings, options-page, validation, state-management]

# Dependency graph
requires: []
provides:
  - analysisWindowSize: 500 in all three DEFAULT_SETTINGS (sidebar.js, StateManager.js, options.js)
  - options.html slider with min=50 / max=1000 / step=50 for analysis window configuration
  - options.js full pipeline: getTimeEstimate helper, updateDisplays, setInputValues, getInputValues wiring
  - ValidationHelpers.validateSettings with analysisWindowSize range check and undefined guard
  - StateManager.MAX_MESSAGES increased from 100 to 500
  - StateManager.setMaxMessages(n) method for runtime adjustment
affects:
  - 01-02 (sidebar reads settings.analysisWindowSize to slice allMessages buffer)
  - 01-03 (any future settings expansion)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Settings fields must be added to all three DEFAULT_SETTINGS simultaneously (sidebar.js, StateManager.js, options.js)
    - ValidationHelpers uses undefined guard for new optional fields for backward compatibility

key-files:
  created: []
  modified:
    - extension/sidebar/sidebar.js
    - extension/sidebar/modules/StateManager.js
    - extension/sidebar/utils/ValidationHelpers.js
    - extension/options/options.js
    - extension/options/options.html
    - extension/options/options.css

key-decisions:
  - "step=50 on the slider makes min=50 a valid stop (50,100,...,1000) while keeping 100-aligned values reachable"
  - "ValidationHelpers undefined guard means legacy settings objects that predate analysisWindowSize are accepted"
  - "StateManager.MAX_MESSAGES raised from 100 to 500 to match the new default analysisWindowSize"
  - "setMaxMessages(n) added so Plan 02 can apply the user's saved setting at runtime without direct property mutation"

patterns-established:
  - "Slider + value-display + value-estimate pattern: range input paired with numeric span and contextual time hint"
  - "setting-warning with class='hidden' toggled via JS: warning appears only when windowVal <= 50"

requirements-completed: [WIN-01]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 1 Plan 01: Analysis Window Settings Foundation Summary

**analysisWindowSize: 500 wired into all DEFAULT_SETTINGS, options page slider (50-1000), and ValidationHelpers with backward-compatible undefined guard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T14:16:47Z
- **Completed:** 2026-02-19T14:18:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- All three DEFAULT_SETTINGS objects (sidebar.js, StateManager.js, options.js) now include `analysisWindowSize: 500`, ensuring existing users auto-receive the default via the spread pattern already in place
- Options page now has a fully wired "Messages to analyze" slider in the Topic Detection section with value display, contextual time estimate, and low-value accuracy warning
- StateManager.MAX_MESSAGES raised from 100 to 500 and `setMaxMessages(n)` added so Plan 02 can apply user settings at runtime

## Task Commits

Each task was committed atomically:

1. **Task 1: Add analysisWindowSize to all three DEFAULT_SETTINGS and ValidationHelpers** - `5a874fe` (feat)
2. **Task 2: Add analysis window slider to options.html and styles to options.css** - `8405714` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `extension/sidebar/sidebar.js` - Added `analysisWindowSize: 500` to DEFAULT_SETTINGS
- `extension/sidebar/modules/StateManager.js` - Added `analysisWindowSize: 500` to DEFAULT_SETTINGS, raised MAX_MESSAGES from 100 to 500, added `setMaxMessages(n)` method
- `extension/sidebar/utils/ValidationHelpers.js` - Added `analysisWindowSize` range validation (50-1000) with undefined guard for backward compatibility
- `extension/options/options.js` - Added `analysisWindowSize: 500` to DEFAULT_SETTINGS; added `analysisWindowSize` to inputs, `getTimeEstimate()` helper, wired updateDisplays / setInputValues / getInputValues
- `extension/options/options.html` - Added "Messages to analyze" slider row inside Topic Detection section (min=50, max=1000, step=50, default=500) with value display, time estimate, and warning spans
- `extension/options/options.css` - Added `.setting-warning` (var(--warning-color)) and `.value-estimate` (var(--text-muted)) rules

## Decisions Made

- `step="50"` on the slider: makes min=50 a valid stop while keeping every 100-aligned value reachable — satisfies both the low-value warning trigger and the range requirement cleanly
- `undefined` guard in ValidationHelpers: new validation block only runs when the field is present, so legacy settings objects stored before this plan don't suddenly fail validation on load
- `StateManager.MAX_MESSAGES` raised from 100 to 500 now (same commit as DEFAULT_SETTINGS change) so the buffer is immediately consistent with the new default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (sidebar reads `settings.analysisWindowSize`) can now safely import and read `settings.analysisWindowSize` — it will always have a value (500 default for new users, stored value for returning users)
- `stateManager.setMaxMessages(settings.analysisWindowSize)` is ready for Plan 02 to call after loading settings
- No blockers

## Self-Check: PASSED

All files confirmed present on disk. Both task commits (5a874fe, 8405714) confirmed in git history.

---
*Phase: 01-analysis-window*
*Completed: 2026-02-19*
