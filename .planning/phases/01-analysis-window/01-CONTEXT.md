# Phase 1: Analysis Window - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Raise MAX_MESSAGES from 100 to 500 across all accumulation paths and expose analysisWindowSize as a user-configurable setting in the options page. No new analysis features — just a bigger window and user control over its size.

</domain>

<decisions>
## Implementation Decisions

### Settings UI Control
- Range slider control (not dropdown or number input)
- Show contextual time estimate alongside value (e.g. "500 messages ~ 25 seconds of busy chat")
- Friendly label — "Messages to analyze" or similar, not "MAX_MESSAGES"
- Place in existing settings section alongside topic/sentiment settings (not a new section)
- Step size of 100 (100, 200, 300... 1000 — 10 stops)

### Default & Range Behavior
- Default: 500 (up from 100)
- Range: 50 to 1000
- Existing users auto-upgrade to 500 on extension update (don't preserve old 100 default)
- No warning at high values — WASM handles it fine
- At minimum (50): show subtle warning that topics/sentiment may be less accurate
- All three DEFAULT_SETTINGS copies (sidebar.js, StateManager.js, options.js) must be updated atomically

### Live Update Behavior
- Change takes effect immediately on next 5-second analysis tick
- Keep all accumulated messages in buffer — next analysis just slices to new window size
- Existing topics/sentiment blend smoothly (no reset) when window size changes mid-stream
- Show subtle message count status in sidebar (e.g. "423/500 messages") during live sessions

### Claude's Discretion
- Exact placement of message count indicator in sidebar layout
- Time estimate calculation formula (can be approximate based on typical chat velocity)
- How to detect and handle the auto-upgrade from old 100 default for existing users
- Exact wording of low-value warning text

</decisions>

<specifics>
## Specific Ideas

- The message count indicator should feel informational, not alarming — small text, not a progress bar
- Time estimates give users a frame of reference for what the number means in practice

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-analysis-window*
*Context gathered: 2026-02-19*
