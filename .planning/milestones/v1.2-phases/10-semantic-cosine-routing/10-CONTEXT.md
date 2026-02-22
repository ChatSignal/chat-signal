# Phase 10: Semantic Cosine Routing - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Classify messages into the four existing buckets (Questions, Issues/Bugs, Requests, General Chat) using cosine similarity to prototype vectors computed from seed phrases. Replaces keyword matching when the encoder is available. Adding new bucket categories or changing the bucket structure is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Seed phrases
- Seed phrases stored in a config file (JSON or JS), not hardcoded — one file for all classification tuning
- 3-5 seed phrases per category (lean, fast to encode)
- Prototype vector per category is the average (centroid) of its seed phrase vectors
- Prototype vectors recomputed every time the sidebar opens — no caching across sessions

### Classification threshold
- Per-category thresholds, not a single global threshold — each bucket can have its own similarity cutoff
- Thresholds stored in the same config file as seed phrases — one file for all tuning
- Below-threshold messages default to General Chat with full confidence — no "low-confidence" marker
- Tie-breaking: highest similarity wins (argmax) when a message scores above threshold for multiple categories

### Mode switching UX
- "Semantic" or "Keyword" text badge displayed near the cluster section header — no special color coding, text only
- Automatic switching only — Semantic when encoder is ready, Keyword when it's not; no user toggle
- New messages only use the active mode — when switching from Keyword to Semantic mid-session, existing bucket assignments stay as-is (no reclassification)

### Fallback behavior
- Badge shows "Keyword" when WASM keyword clustering is active — no extra fallback notices
- On gpu-unavailable event: attempt WASM-backend MiniLM encoding first (slower but still semantic)
- If WASM encoding is too slow: silent fallback to keyword mode — badge switches, no toast or warning
- Cosine routing is a standalone module (e.g., cosine-router.js) — separate from encoder-adapter.js

### Claude's Discretion
- Exact seed phrases for each category
- Config file format (JSON vs JS module)
- Starting threshold values per category
- WASM encoding speed threshold for fallback decision
- Exact badge styling and placement within the cluster section header

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-semantic-cosine-routing*
*Context gathered: 2026-02-20*
