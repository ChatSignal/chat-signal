---
phase: 05-manifest-audit-and-disclosure-ui
plan: 01
subsystem: infra
tags: [chrome-extension, manifest-v3, csp, webllm, cws]

# Dependency graph
requires:
  - phase: 04-privacy-policy-and-cws-dashboard
    provides: cws-justifications.md with permission justifications and Phase 5 note for unlimitedStorage
provides:
  - CWS-ready manifest.json with version 1.1.0, unlimitedStorage permission, and updated description
  - CSP rationale section in cws-justifications.md documenting every directive and connect-src domain
affects:
  - 05-02 (disk space warning in consent modal — same phase)
  - 05-03 (store listing assets reference manifest version)
  - 06 (submission phase uses manifest as-is)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSP entries grep-verified before keeping — no speculative entries retained"
    - "CWS justifications document maintained alongside manifest for reviewer transparency"

key-files:
  created: []
  modified:
    - extension/manifest.json
    - docs/cws-justifications.md

key-decisions:
  - "raw.githubusercontent.com CSP entry retained — grep-confirmed used by WebLLM modelLibURLPrefix at libs/web-llm/index.js"
  - "Description uses single-purpose framing: real-time creator dashboard with explicit feature names (questions/issues/requests, sentiment, trending topics, session history) and platform names (YouTube, Twitch)"
  - "wasm-unsafe-eval documented as correct MV3 directive for WebAssembly.instantiate() — not unsafe-eval"

patterns-established:
  - "Manifest changes: always verify with python3 JSON parse + targeted grep assertions before committing"

requirements-completed: [MNFST-01, MNFST-02, MNFST-03, MNFST-04]

# Metrics
duration: 1min
completed: 2026-02-20
---

# Phase 5 Plan 01: Manifest Audit Summary

**Manifest bumped to v1.1.0 with unlimitedStorage permission, single-purpose CWS description, and grep-verified CSP entries documented in cws-justifications.md**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-20T03:03:54Z
- **Completed:** 2026-02-20T03:04:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Version bumped from 0.1.0 to 1.1.0 in manifest.json
- unlimitedStorage permission added (required for WebLLM ~400MB IndexedDB storage)
- Description updated to single-purpose "creator dashboard" framing naming all key features and both platforms
- CSP connect-src entries grep-verified: raw.githubusercontent.com confirmed active at libs/web-llm/index.js (modelLibURLPrefix)
- CSP rationale section added to cws-justifications.md covering every directive with source-level justifications
- Phase 5 placeholder note removed from unlimitedStorage section (permission now in manifest)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update manifest.json — version, permissions, description, and verify CSP** - `f86c907` (chore)
2. **Task 2: Add CSP rationale section to cws-justifications.md** - `6395d94` (docs)

**Plan metadata:** (docs commit — see final commit below)

## Files Created/Modified

- `extension/manifest.json` - Version 1.1.0, unlimitedStorage added, description updated to creator dashboard framing, CSP unchanged (all three connect-src domains retained)
- `docs/cws-justifications.md` - Added CSP rationale section between Permission Justifications and Remote Code Declaration; removed Phase 5 placeholder note from unlimitedStorage entry

## Decisions Made

- CSP entry `raw.githubusercontent.com` retained after grep-verification confirmed it is used by WebLLM at `libs/web-llm/index.js` for `modelLibURLPrefix` — highest-risk CSP entry confirmed necessary
- Description framing follows locked decisions: "creator dashboard" framing, feature names (clusters, sentiment, trending topics, session history), platform names (YouTube, Twitch), optional AI summaries
- `'wasm-unsafe-eval'` documented explicitly as the correct MV3 directive for WebAssembly.instantiate() — not `'unsafe-eval'`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- manifest.json is CWS submission-ready for version, permissions, and description
- CSP justifications available for CWS dashboard and future reviewers
- Ready for Phase 5 Plan 02: disk space warning in consent modal (WebLLM download disclosure)

---
*Phase: 05-manifest-audit-and-disclosure-ui*
*Completed: 2026-02-20*
