---
phase: 02-dompurify-integration
plan: "02"
subsystem: ui
tags: [dompurify, security, xss, sanitization, dom, sidebar]

# Dependency graph
requires:
  - phase: 02-01
    provides: DOMPurify global, safeSetHTML and DOMPURIFY_CONFIG exports from DOMHelpers.js
provides:
  - sidebar.js with zero raw innerHTML assignments (except clear-to-empty)
  - All Category C dynamic templates wrapped with DOMPurify.sanitize(DOMPURIFY_CONFIG)
  - All Category B static string fallbacks using safeSetHTML()
  - Private safeSetHTML/escapeHtml/safeCreateElement copies removed from sidebar.js
  - DOMHelpers.js imports wired into sidebar.js
affects:
  - Any future plan adding innerHTML usage in sidebar.js (must follow DOMPurify pattern)
  - Phase 3 (options page) — same sanitization pattern should apply if innerHTML used

# Tech tracking
tech-stack:
  added: []
  patterns: [dompurify-inline-sanitize, safeSetHTML-for-static-strings, defense-in-depth-escapeHtml]

key-files:
  created: []
  modified:
    - extension/sidebar/sidebar.js

key-decisions:
  - "Remove duplicate const declarations in showSessionSummary() — pre-existing SyntaxError bug fixed as Rule 1 auto-fix"
  - "Use DOMPurify.sanitize() inline for dynamic templates and safeSetHTML() for static string fallbacks — consistent with plan"
  - "Preserve all escapeHtml() calls inside templates — defense in depth, double-encoding is safe"
  - "escapeHtml() added to formatDuration/messageCount/mood in card.innerHTML for full field coverage"

patterns-established:
  - "Pattern 1: Dynamic template literals use DOMPurify.sanitize(template, DOMPURIFY_CONFIG)"
  - "Pattern 2: Static HTML strings use safeSetHTML(element, html)"
  - "Pattern 3: innerHTML = '' (clear-to-empty) is always left unwrapped"
  - "Pattern 4: escapeHtml() used on all user-data fields inside templates even when wrapped by DOMPurify"

requirements-completed: [SAN-02, SAN-03]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 2 Plan 02: DOMPurify Integration — innerHTML Migration Summary

**Zero raw innerHTML assignments remain in sidebar.js: all 11 dynamic templates wrapped with DOMPurify.sanitize() and all 8 static-string fallbacks migrated to safeSetHTML(), with private duplicate helpers removed**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T19:18:08Z
- **Completed:** 2026-02-19T19:21:21Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `import { safeSetHTML, DOMPURIFY_CONFIG, escapeHtml, safeCreateElement }` from DOMHelpers.js to sidebar.js
- Removed three private duplicate functions: `escapeHtml`, `safeCreateElement`, and `safeSetHTML` (old regex allowlist)
- Wrapped all 11 dynamic template literal innerHTML sites with `DOMPurify.sanitize(..., DOMPURIFY_CONFIG)`
- Converted all 8 static string fallback innerHTML sites to `safeSetHTML()`
- Auto-fixed pre-existing SyntaxError bug: duplicate `const clustersContainer` and `const questionsContainer` declarations in `showSessionSummary()`, merged logic to correctly use session-accumulated `sessionQuestions`

## Task Commits

Each task was committed atomically:

1. **Task 1: Import DOMHelpers and remove private function copies** - `f31c698` (refactor)
2. **Task 2: Migrate all dynamic innerHTML assignments to DOMPurify** - `58f035f` (feat)

**Plan metadata:** (final commit below)

## Files Created/Modified
- `extension/sidebar/sidebar.js` - Added DOMHelpers import; removed 3 private duplicate functions; wrapped all dynamic innerHTML with DOMPurify.sanitize(); migrated all static-string innerHTML to safeSetHTML()

## Decisions Made
- Removed duplicate `const` declarations in `showSessionSummary()` as a Rule 1 auto-fix — they would cause a SyntaxError at runtime. The merged logic uses `sessionQuestions` (session-wide accumulation) which is the correct data source, replacing the incorrect first-block that used `questionsBucket.sample_messages` (last-batch only).
- Added `escapeHtml()` wrapping to `formatDuration()`, `session.messageCount`, and `session.mood` fields inside `card.innerHTML` in `renderHistoryList()` — defense in depth even though DOMPurify would catch anything, these fields are derived from user data.
- `safeSetHTML` count (9) is below plan estimate (>= 11) because removing the duplicate block eliminated 2 redundant target sites. Primary criterion (zero unprotected innerHTML) passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate const declarations (SyntaxError) in showSessionSummary()**
- **Found during:** Task 2 (Migrate all dynamic innerHTML assignments to DOMPurify)
- **Issue:** `const clustersContainer` and `const questionsContainer` were each declared twice in the same function scope — once in a safe DOM block (lines 785/801) and again in a duplicate raw innerHTML block (lines 815/828). This is a SyntaxError in JavaScript strict mode.
- **Fix:** Removed the duplicate second block (lines 814-837). Updated the questions logic in the surviving block to use `sessionQuestions` (session-wide accumulation) instead of `questionsBucket.sample_messages` (last-batch only), matching the correct intent of the removed duplicate.
- **Files modified:** extension/sidebar/sidebar.js
- **Verification:** grep confirms zero duplicate `const clustersContainer` or `const questionsContainer` in showSessionSummary(); questions now rendered from `sessionQuestions`
- **Committed in:** 58f035f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Auto-fix was necessary to avoid SyntaxError and use correct data source for questions. The overall verification criteria (zero unprotected innerHTML) met. safeSetHTML count of 9 vs expected >= 11 is explained by the duplicate block removal.

## Issues Encountered

None — all remaining plan changes applied cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- sidebar.js is now fully DOMPurify-protected — zero XSS attack surface from innerHTML
- Phase 2 is complete: DOMPurify vendored, safeSetHTML rewritten, all innerHTML migrated
- Phase 3 (options page / any remaining features) can follow Pattern 1 and Pattern 2 above for new innerHTML usage

---
*Phase: 02-dompurify-integration*
*Completed: 2026-02-19*

## Self-Check: PASSED

- extension/sidebar/sidebar.js: FOUND
- .planning/phases/02-dompurify-integration/02-02-SUMMARY.md: FOUND
- Commit f31c698: FOUND
- Commit 58f035f: FOUND
