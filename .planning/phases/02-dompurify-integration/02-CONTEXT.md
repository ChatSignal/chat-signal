# Phase 2: DOMPurify Integration - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the custom regex-based `safeSetHTML` in DOMHelpers.js with DOMPurify 3.3.1 across all sidebar innerHTML assignments. Vendor the library, migrate every innerHTML site, and remove the old sanitizer. No new UI features or analysis changes.

</domain>

<decisions>
## Implementation Decisions

### Sanitization Strictness
- Use DOMPurify defaults — no custom allowlist. Defaults already strip scripts, event handlers, and dangerous patterns
- Sanitize everything — every innerHTML assignment goes through DOMPurify, including trusted JS templates. Defense in depth, no exceptions
- String mode (default) — DOMPurify.sanitize() returns a clean string, not a DocumentFragment. Keeps innerHTML pattern for simpler migration
- Centralized config — define a shared DOMPurify config object in DOMHelpers.js. Even if it starts as defaults, it's one place to tighten later

### Helper API After Migration
- Keep `safeSetHTML` name — same function signature, new DOMPurify internals. Zero call-site changes where already used
- safeSetHTML is the only exported helper — no separate sanitizeHTML string wrapper. One function, one pattern
- Inline `DOMPurify.sanitize()` is acceptable at call sites where safeSetHTML doesn't naturally fit (e.g., building composite HTML)
- Add comment convention — `// All innerHTML must use DOMPurify` at the top of sidebar files as a reminder for future contributors

### Edge Case Handling
- Test emote rendering carefully — emote names are plain text in <span> tags but some may contain special characters worth verifying
- If DOMPurify strips something that causes visible breakage, fix the HTML source — don't allowlist attributes. DOMPurify config stays default
- Treat WASM output as untrusted — analysis results pass through DOMPurify like all other content. Defense in depth
- Trust document order for script loading — place DOMPurify script tag before the ES module in sidebar.html, no runtime guard check needed

### Claude's Discretion
- Exact placement of DOMPurify script tag in sidebar.html relative to other scripts
- How to structure the centralized config constant
- Which innerHTML sites are already using safeSetHTML vs raw innerHTML (codebase audit)
- Order of migration (which files/functions to migrate first)

</decisions>

<specifics>
## Specific Ideas

- The migration should feel invisible to users — zero visual change to the sidebar rendering
- "Sanitize everything" is the guiding principle — consistency over per-site risk analysis

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-dompurify-integration*
*Context gathered: 2026-02-19*
