# Phase 5: Manifest Audit and Disclosure UI - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up the manifest for Chrome Web Store submission (version bump, CSP audit, permissions, description) and add disk space disclosure to the WebLLM consent modal. Requirements: MNFST-01 through MNFST-04, DISC-01, DISC-02.

</domain>

<decisions>
## Implementation Decisions

### Consent modal copy
- Name HuggingFace explicitly as the download source — don't use generic "external CDN"
- State the ~450MB requirement without showing dynamic available space (no need to display navigator.storage.estimate() result in the modal text)
- Privacy-forward tone — lead with local-only processing, emphasize no data leaves the browser
- Explicitly mention persistent storage — "The model is stored locally and persists across browser sessions"

### Insufficient space UX
- Grey out "Enable AI" button when space is insufficient, show inline message below it ("Not enough disk space available (~450MB needed)")
- Space threshold: 450MB (model size + IndexedDB overhead buffer)
- When space is insufficient, change "Skip for now" to "Continue without AI" to clarify it's the only viable option
- If navigator.storage.estimate() API is unavailable, allow the download attempt — let it fail naturally rather than blocking

### Manifest description
- Frame as "creator dashboard" — "Real-time dashboard for..."
- Name specific features: message clusters, sentiment, trending topics, session history
- Name platforms: YouTube and Twitch
- Mention optional AI summaries as a differentiator

### CSP cleanup
- Remove raw.githubusercontent.com from connect-src only if grep confirms no code fetches from it
- Keep huggingface.co and cdn-lfs.huggingface.co at domain level — don't attempt path-specific restrictions (WebLLM uses various paths)
- Full CSP review — verify script-src and object-src are minimal and justified, not just connect-src
- Add brief comments near manifest CSP (or adjacent doc) explaining why each entry exists

### Claude's Discretion
- Exact wording of the consent modal (within the tone and content constraints above)
- How to structure CSP justification comments (inline vs separate file)
- Whether wasm-unsafe-eval and object-src 'self' need changes after full review

</decisions>

<specifics>
## Specific Ideas

- Current modal text: "This downloads a ~400MB model on first use. Processing happens locally - no data sent to servers." — enhance rather than replace
- "Continue without AI" button text when space insufficient (replacing "Skip for now")
- Description should work as a single-purpose framing that satisfies CWS review while being informative to users

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-manifest-audit-and-disclosure-ui*
*Context gathered: 2026-02-19*
