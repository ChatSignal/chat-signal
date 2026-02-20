# Phase 6: Store Listing Assets - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the Chrome Web Store listing assets: store description copy, screenshots (1280x800), and promotional image (440x280). All copy must use approved trademark patterns. This phase produces the assets — uploading to CWS happens in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Store description copy
- Lead with audience: "Built for streamers and moderators..." — audience-first hook
- Friendly, conversational tone — warm and approachable, not corporate
- Mention all applicable trust signals: free, no account needed, all processing stays local
- Bullet list format for the detailed description — one feature per line with brief explanation
- Must use approved trademark patterns ("works with YouTube" not "YouTube extension")

### Screenshot content
- 3 screenshots, one per major feature area: clusters, sentiment/mood, trending topics
- Mock data injected programmatically — no real stream dependency
- Sidebar only, no stream page context — avoids trademark issues and keeps focus on the extension
- Dark mode only — matches what most streamers use, single consistent look

### Promotional image design
- Logo + tagline style: extension icon/logo centered with tagline below
- Dark gradient background matching the extension's dark mode aesthetic
- Tagline: "See what your chat is saying"
- No platform logos (YouTube/Twitch) — avoids trademark issues entirely, just Chat Signal branding

### Asset production method
- Screenshots: Puppeteer/Playwright script for automated, reproducible captures at exact 1280x800 dimensions
- Promotional image: SVG/HTML rendered to 440x280 PNG — version-controlled and reproducible
- Assets stored in `docs/store/` under GitHub Pages (web-accessible)
- Generation scripts kept in `scripts/` for future regeneration after UI changes

### Claude's Discretion
- Exact mock data content (realistic message examples, topic words, sentiment distribution)
- Specific gradient colors and typography for the promo image
- Which feature to emphasize in each of the 3 screenshots
- Puppeteer vs Playwright choice for the screenshot script

</decisions>

<specifics>
## Specific Ideas

- Tagline "See what your chat is saying" for both promo image and potentially the store summary line
- Audience-first hook: address streamers and moderators directly
- Dark mode screenshots align with the streaming community's preference

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-store-listing-assets*
*Context gathered: 2026-02-20*
