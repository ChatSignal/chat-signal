# Phase 3: Configurable Thresholds - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire inactivityTimeout and duplicateWindow to the settings pipeline so users can tune them from the options page, and harden all numeric threshold validation with Number.isFinite() to reject NaN inputs. No new analysis features or UI components beyond the settings controls.

</domain>

<decisions>
## Implementation Decisions

### Inactivity Timeout UX
- Range slider control (consistent with analysis window slider)
- Range: 30-600 seconds, default 120s, step 30s
- Display raw seconds value (e.g., "120s") — not human-readable minutes
- Place in the existing settings section alongside other thresholds (not a new section)
- Change takes effect immediately on the running session timer — no restart required

### Validation Behavior
- Prevent saving when any field has an invalid value — show inline error, disable save until corrected
- Harden ALL existing numeric fields retroactively with Number.isFinite(), not just new fields
- Validate in JS even for range sliders — defense in depth against programmatic manipulation
- Reuse existing `.setting-warning` class for validation error display — same style, no new CSS class

### duplicateWindow Wiring
- Just fix the plumbing — no UI changes to the existing slider
- Change takes effect immediately on next analysis tick (consistent with analysis window behavior)
- inactivityTimeout also reads from settings immediately — both sidebar.js and SessionManager.js use live value

### Claude's Discretion
- Exact label and description text for inactivity timeout slider
- How to wire inactivityTimeout through SessionManager (replace hardcoded constant with settings read)
- Which WASM call site(s) need duplicateWindow passed through
- How to implement "prevent saving" — disable button vs block the save function
- Order of implementation (settings UI first vs wiring first)

</decisions>

<specifics>
## Specific Ideas

- Consistency matters — inactivity timeout slider should look and behave like the analysis window slider
- "Defense in depth" theme continues from Phase 2 — validate even when the browser constrains

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-configurable-thresholds*
*Context gathered: 2026-02-19*
