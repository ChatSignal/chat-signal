# Phase 8: Encoder Foundation - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Vendor Transformers.js, load the all-MiniLM-L6-v2 encoder, and produce 384-dimensional embeddings from chat messages. This is the foundational AI layer — no clustering changes yet (Phase 10), no GPU scheduling yet (Phase 9). The encoder loads, encodes messages, and caches results.

</domain>

<decisions>
## Implementation Decisions

### Loading experience
- Progress bar with percentage at the top of the sidebar, inline (slim bar above cluster content)
- Same progress bar shown on every sidebar open, whether first download (~23MB) or cached initialization (~5-30s)
- Stage-aware text: "Downloading model..." -> "Initializing encoder..." -> "Warming up..." with percentage throughout
- Sidebar waits for encoder to finish loading before displaying any analysis results (no WASM-first in Phase 8)
- Progress bar silently dismisses when loading completes — fills to 100% and fades out, no "ready" confirmation

### Encoder status visibility
- No visible encoder status indicator in Phase 8 — Phase 10 adds the Semantic/Keyword badge
- All encoder logs (load time, batch sizes, cache hits, backend selection) go to console.log only
- No debug panel in the sidebar

### Batch size strategy
- Adaptive batching: smaller batches in slow chat, larger in fast chat
- Minimum batch size: 10 messages (matches requirement floor)
- Hard cap at 50 messages per batch (matches requirement ceiling)
- Time-based trigger: if fewer than 10 messages have accumulated after a timeout period, encode whatever is queued — prevents messages from going stale in slow chats

### Failure communication
- On download failure: show "Download failed, retrying..." in the progress bar area, retry 2-3 times before giving up
- After retries exhausted: brief error message "Semantic engine unavailable — using keyword analysis" for a few seconds, then sidebar proceeds normally with WASM keyword clustering
- WebGPU/WASM backend switch is transparent to the user — no main sidebar indication
- GPU vs CPU encoding backend info shown in Settings page only, not in the main sidebar view

### Claude's Discretion
- Exact progress bar styling (color, height, animation)
- Time-based trigger timeout duration (e.g. 5s, 10s)
- Adaptive batch size curve between 10-50
- Retry delay strategy (immediate, exponential backoff)
- Progress bar fade-out animation timing
- Stage text wording refinements

</decisions>

<specifics>
## Specific Ideas

- Progress bar should be at the very top of the sidebar content area, inline — not a modal or overlay
- Stage text differentiates download from initialization so users understand what's happening on first run vs subsequent runs
- "Semantic engine unavailable" wording chosen to be user-friendly without being technical

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-encoder-foundation*
*Context gathered: 2026-02-20*
