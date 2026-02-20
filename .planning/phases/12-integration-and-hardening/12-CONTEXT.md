# Phase 12: Integration and Hardening - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete pipeline works end-to-end with verified fallback paths, a correct progressive loading sequence, and updated consent disclosure. WASM keyword clustering remains the permanent fallback. No new features — this phase hardens what Phases 8-11 built.

</domain>

<decisions>
## Implementation Decisions

### Loading waterfall UX
- Subtle status text near the mode badge while MiniLM loads (e.g., "Loading semantic engine...") — no progress bar
- Seamless swap when semantic mode activates: next analysis cycle silently uses semantic results, no animation or re-sort
- Phase 11's "Basic mode" indicator shows in the summary area while Qwen loads — reuse existing fallback UI
- Downloads for MiniLM and Qwen run in parallel where safe (network downloads concurrent, GPU init steps serialized through the GPU scheduler)

### Fallback transitions
- Silent fallback when encoder fails mid-session: badge switches to "Keyword" but no toast or alert
- When AI is disabled (no consent or toggled off), show subtle "Keyword" badge — no upsell or prompt to enable AI
- On keyword-to-semantic upgrade during initial load, only new messages get semantic routing — already-displayed messages stay in their keyword-assigned buckets
- If Qwen crashes or produces garbage, auto-retry once after a cooldown (~60s). If second attempt fails, stay in Basic mode for the session (user can manually retry via Phase 11's Retry AI button)

### Consent modal update
- Update consent modal text to mention both models: a small encoder (~23MB) loads automatically, enabling AI adds a ~450MB language model
- Storage space check (navigator.storage.estimate) gates only on Qwen's ~450MB — MiniLM is small and likely already cached by the time the modal appears

### Cache warm-start
- Brief loading state on warm-start: show "Restoring semantic engine..." while MiniLM re-initializes from cache
- Reuse Phase 11's "Basic mode" indicator for Qwen warm-start — no separate "Restoring AI..." text
- Trust the browser cache for model validity — no explicit corruption/version checks. Normal error fallback catches issues
- Same parallel-where-safe loading approach as cold start: downloads concurrent, GPU init serialized. Consistent behavior regardless of cache state

### Claude's Discretion
- Exact cooldown duration for Qwen auto-retry (suggested ~60s, flexible)
- Exact wording of status text ("Loading semantic engine...", "Restoring semantic engine...", etc.)
- How to integrate the status text near the existing Semantic/Keyword badge without cluttering the UI

</decisions>

<specifics>
## Specific Ideas

- The loading experience should feel like progressive enhancement: WASM works immediately, then things get better as models load
- No dramatic transitions — user shouldn't feel like the UI is "resetting" when semantic mode kicks in
- Consent modal should clearly separate the two models so users understand what's automatic vs. opt-in

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-integration-and-hardening*
*Context gathered: 2026-02-20*
