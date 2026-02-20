# Phase 4: Privacy and Dashboard Compliance - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Write and host a privacy policy at a public HTTPS URL (GitHub Pages with custom domain); complete all CWS developer dashboard fields including per-permission justifications and data usage certifications. This unblocks any submission attempt. Manifest changes, UI modifications, and store listing assets are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Privacy policy tone and depth
- Plain language throughout — conversational, easy to read, no legal jargon
- Include a "Last updated" date (no version number)
- Link to GitHub Issues for privacy questions (no personal email exposed)
- Simple change notification clause: "We may update this policy. Check back for changes."

### Hosting and URL structure
- Privacy policy lives in `docs/` folder as plain markdown
- GitHub Pages renders it with default Jekyll theme
- Custom domain: `chatsignal.dev` — requires CNAME file in docs/
- Privacy policy URL: `chatsignal.dev/privacy-policy`

### Permission justification framing
- User-benefit focused framing (explain WHY from the user's perspective)
- Host permissions (youtube.com, twitch.tv): direct and specific about DOM reading — "Reads live chat messages from the page DOM to perform real-time clustering and sentiment analysis"
- All justifications stored in a standalone version-controlled doc: `docs/cws-justifications.md`
- Single doc combining permission justifications AND data certification checkbox answers

### Data disclosure scope
- "Processes" framing for DOM reading — emphasizes chat messages are already publicly visible
- "Data never leaves your browser" mentioned naturally in the data practices flow (not prominently highlighted)
- WebLLM/HuggingFace download disclosed inline alongside other data practices — not a separate section
- chrome.storage.local usage disclosed with clearing instructions: "Session summaries are saved locally. You can clear them from the History tab or by removing the extension."

### Claude's Discretion
- Exact section ordering within the privacy policy
- Whether to use headers or a flat structure for the policy
- Formatting of the CWS justifications doc

</decisions>

<specifics>
## Specific Ideas

- Domain is `chatsignal.dev` — CNAME file needed in docs/ for GitHub Pages custom domain
- Privacy policy should feel approachable for a small indie extension, not corporate
- Justifications should help CWS reviewers quickly understand why each permission exists

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-privacy-and-dashboard-compliance*
*Context gathered: 2026-02-19*
