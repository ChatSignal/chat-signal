---
phase: 06-store-listing-assets
plan: 01
subsystem: ui
tags: [cws, store-listing, promo-image, sharp, playwright, trademark]

# Dependency graph
requires:
  - phase: 04-privacy-policy
    provides: Privacy policy URL and product name decision ("Chat Signal")
  - phase: 05-cws-dashboard
    provides: Confirmed CSP, manifest audit, CWS justifications reference doc
provides:
  - CWS-compliant store listing copy (item summary + full description) at docs/cws-store-listing.md
  - Promotional image at docs/store/promo-440x280.png (exactly 440x280 px PNG)
  - Reproducible promo image generation script at scripts/promo-image.mjs
  - playwright and sharp installed as devDependencies (also needed for plan 06-02 screenshots)
affects: [06-02-screenshots, 07-verification-submission]

# Tech tracking
tech-stack:
  added: [playwright@1.58.2, sharp@0.34.5]
  patterns:
    - SVG-to-PNG via sharp buffer API with base64 icon embed (avoids libvips emoji font dependency)
    - CWS-compliant trademark patterns: "works with YouTube", "for Twitch"

key-files:
  created:
    - docs/cws-store-listing.md
    - scripts/promo-image.mjs
    - docs/store/promo-440x280.png
  modified:
    - package.json

key-decisions:
  - "Embed extension icon as base64 PNG in SVG (not emoji text) — libvips/sharp has no emoji font on Linux"
  - "No platform logos in promo image — avoids trademark issues entirely, Chat Signal branding only"
  - "Item summary is 97 chars (well within 132 limit): 'Real-time chat analysis for streamers and moderators. Works with YouTube and Twitch live streams.'"
  - "Playwright and sharp installed here (plan 06-01) since both needed in 06-02 screenshots plan"

patterns-established:
  - "SVG promo image: author SVG inline in .mjs script with base64 icon embed, convert via sharp to exact-dimension PNG"
  - "Trademark compliance: use 'Works with YouTube and Twitch' — never 'YouTube/Twitch extension'"

requirements-completed: [STORE-01, STORE-03]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 6 Plan 1: Store Listing Assets — Copy and Promo Image Summary

**CWS store listing copy (97-char summary, audience-first description) and 440x280 PNG promo image generated via sharp SVG pipeline with base64 icon embed**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T03:36:43Z
- **Completed:** 2026-02-20T03:39:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- CWS-compliant store listing copy written with approved trademark patterns ("Works with YouTube and Twitch live streams.")
- 440x280 promotional image generated at exact CWS-required dimensions with dark gradient, extension icon, and tagline
- Reproducible image generation script committed alongside the PNG artifact
- playwright@1.58.2 and sharp@0.34.5 installed as devDependencies (also required for plan 06-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write store listing copy and install npm dependencies** - `c343e61` (feat)
2. **Task 2: Create promo image generation script and generate 440x280 PNG** - `1e47bf2` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `docs/cws-store-listing.md` — CWS dashboard copy-paste reference: item summary (97 chars) and full description with bullet features and trust signals
- `scripts/promo-image.mjs` — ES module script: reads extension icon, constructs SVG, converts to PNG via sharp
- `docs/store/promo-440x280.png` — Promotional image at exactly 440x280 px for CWS dashboard upload
- `package.json` — Added playwright@1.58.2 and sharp@0.34.5 as devDependencies

## Decisions Made

- **Base64 icon embed:** The extension icon is read from `extension/icons/icon-128.png`, converted to base64, and embedded as an `<image>` element in the SVG. This avoids libvips/sharp's emoji font limitation on Linux — emoji glyphs in SVG text render as blank boxes without an emoji font installed.
- **No platform logos:** The promo image shows only Chat Signal branding (icon + name + tagline). YouTube/Twitch logos are omitted entirely to avoid trademark risk.
- **Dark gradient:** `#111827` to `#1f2937` diagonal gradient matches the extension's dark mode color variables.

## Deviations from Plan

None — plan executed exactly as written.

The plan correctly anticipated the `icon-128.png` filename (with hyphen, not `icon128.png`) and specified the base64 embed approach to handle libvips emoji limitations.

## Issues Encountered

- `package-lock.json` is git-ignored in this project — excluded from commit staging (used `git add package.json` only, not `git add -A`). No functional impact.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `docs/cws-store-listing.md` is ready to copy-paste into the CWS dashboard item summary and description fields
- `docs/store/promo-440x280.png` is ready for upload to CWS dashboard promotional image field
- playwright and sharp are installed — plan 06-02 (screenshots) can proceed immediately
- Run `node scripts/promo-image.mjs` at any time to regenerate the promo image after icon or branding changes

---
*Phase: 06-store-listing-assets*
*Completed: 2026-02-20*
