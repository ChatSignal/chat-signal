---
phase: 04-privacy-and-dashboard-compliance
plan: "01"
subsystem: infra
tags: [github-pages, jekyll, privacy-policy, cws, chrome-web-store, compliance]

# Dependency graph
requires: []
provides:
  - "docs/CNAME mapping chatsignal.dev to GitHub Pages"
  - "docs/privacy-policy.md published at /privacy-policy permalink"
  - "docs/cws-justifications.md copy-paste reference for CWS dashboard"
  - "Root PRIVACY.md pointer to hosted policy URL"
affects:
  - 04-privacy-and-dashboard-compliance
  - 07-submission-verification

# Tech tracking
tech-stack:
  added: [github-pages, jekyll-front-matter]
  patterns: [docs-folder-github-pages, jekyll-permalink, cws-justifications-reference-doc]

key-files:
  created:
    - docs/CNAME
    - docs/privacy-policy.md
    - docs/cws-justifications.md
  modified:
    - PRIVACY.md

key-decisions:
  - "Plain-language conversational tone throughout privacy policy — no legal jargon, small indie extension feel"
  - "HuggingFace download disclosed inline with other data practices, not as a separate section"
  - "Root PRIVACY.md replaced with pointer — GitHub renders it on repo page, redirects to authoritative hosted URL"
  - "unlimitedStorage justification included in cws-justifications.md now with Phase 5 note — prevents it being forgotten at submission time"

patterns-established:
  - "docs/ folder as GitHub Pages publishing source with CNAME inside docs/ (not repo root)"
  - "cws-justifications.md as single version-controlled source of truth for CWS dashboard copy-paste"

requirements-completed: [PRIV-01, PRIV-02, PRIV-03]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 4 Plan 01: Privacy Policy, CNAME, and CWS Justifications Summary

**Privacy policy at docs/privacy-policy.md (chatsignal.dev/privacy-policy), CNAME for GitHub Pages custom domain, and cws-justifications.md structured for CWS dashboard copy-paste across all five Privacy Practices tab sections**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T01:01:08Z
- **Completed:** 2026-02-20T01:03:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- docs/CNAME created with exactly `chatsignal.dev` for GitHub Pages custom domain mapping
- docs/privacy-policy.md written in conversational plain-language tone with Jekyll front matter and `permalink: /privacy-policy`; discloses all four PRIV-01 required topics (DOM reading, chrome.storage.local, HuggingFace download, no external transmission)
- docs/cws-justifications.md structured to match CWS dashboard Privacy Practices tab fields; covers all PRIV-02 permissions and PRIV-03 data certification checkboxes including unlimitedStorage (Phase 5 note) and all four limited-use compliance statements
- Root PRIVACY.md replaced with a short pointer to the hosted policy URL

## Task Commits

Each task was committed atomically:

1. **Task 1: Create docs/ with CNAME and privacy policy** - `c026014` (feat)
2. **Task 2: Add CWS justifications doc and update root PRIVACY.md** - `2e715c2` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `docs/CNAME` - GitHub Pages custom domain mapping for chatsignal.dev
- `docs/privacy-policy.md` - Published privacy policy with Jekyll front matter; permalink /privacy-policy
- `docs/cws-justifications.md` - Copy-paste reference for CWS dashboard Privacy Practices tab
- `PRIVACY.md` - Replaced with short pointer to hosted URL at chatsignal.dev/privacy-policy

## Decisions Made
- Conversational tone matches the "small indie extension" character established in CONTEXT.md decisions — avoided all legal boilerplate
- HuggingFace download disclosed inline alongside chrome.storage discussion rather than as its own section, per user decision — keeps the policy feeling short and readable
- unlimitedStorage justification written now (not Phase 5) with a clear note, per research pitfall guidance — prevents it being missed at submission time
- Root PRIVACY.md kept as a pointer (not deleted) so GitHub continues to surface a PRIVACY.md on the repo page

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**GitHub Pages and DNS configuration required before the privacy policy URL is live.** Steps needed after this commit:

1. In repo Settings → Pages → Build and deployment: select `main` branch, `/docs` folder as publishing source
2. Set custom domain to `chatsignal.dev` in the Pages settings
3. At DNS registrar for chatsignal.dev, set A records to GitHub Pages IPs:
   - 185.199.108.153
   - 185.199.109.153
   - 185.199.110.153
   - 185.199.111.153
4. Verify with: `dig chatsignal.dev +noall +answer -t A`
5. Wait for DNS propagation and HTTPS certificate issuance (up to 24 hours)
6. Confirm policy is live at https://chatsignal.dev/privacy-policy before completing CWS dashboard

## Next Phase Readiness
- All three compliance documents are version-controlled and ready
- docs/cws-justifications.md is the copy-paste source for the CWS dashboard Privacy Practices tab — use it once GitHub Pages is live and the privacy policy URL resolves
- Phase 5 (manifest updates) should add `unlimitedStorage` to manifest, then the pre-written justification in cws-justifications.md can be pasted into the dashboard

## Self-Check: PASSED

All created files verified present on disk:
- FOUND: docs/CNAME
- FOUND: docs/privacy-policy.md
- FOUND: docs/cws-justifications.md
- FOUND: PRIVACY.md (pointer)
- FOUND: .planning/phases/04-privacy-and-dashboard-compliance/04-01-SUMMARY.md

All task commits verified present in git log:
- FOUND: c026014 (Task 1 — CNAME + privacy policy)
- FOUND: 2e715c2 (Task 2 — CWS justifications + PRIVACY.md pointer)

---
*Phase: 04-privacy-and-dashboard-compliance*
*Completed: 2026-02-20*
