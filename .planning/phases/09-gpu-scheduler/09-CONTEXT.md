# Phase 9: GPU Scheduler - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A standalone GPU scheduler module (`gpu-scheduler.js`) that serializes WebGPU access between the encoder (MiniLM) and SLM (Qwen). Ensures the two consumers never execute GPU work concurrently. Semantic clustering logic, SLM prompts, and fallback paths are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Queue behavior
- Single shared queue — one queue with tasks tagged by type, priority determines ordering
- Drop-oldest policy when queue is full — stale encoder batches are irrelevant since fresh chat data supersedes them
- Queue depth capped at 5-10 tasks (Claude picks exact number within this range)
- Silent drops — callers fire-and-forget; the next analysis cycle picks up fresh data anyway

### Priority & preemption
- Hardcoded priority levels: encoder = priority 1, SLM = priority 2
- Weighted fairness — encoder gets priority but SLM gets guaranteed slots to avoid starvation (Claude picks the ratio)
- No preemption — never interrupt a running task; encoder waits until the current SLM call finishes before starting

### Observability
- Developer-only — no GPU scheduler indicators in the sidebar UI
- Minimal console logging by default — only log errors and dropped tasks
- Always-on internal audit — scheduler records start/end timestamps in memory (not console) for verifying non-overlapping execution
- Status API exposed — `getStatus()` method returns queue depth, active task type, and last execution timestamps for other modules to query

### Failure handling
- Caller handles errors — scheduler reports the error; encoder/SLM decide whether to retry or fall back
- 30-second timeout per GPU task — tasks exceeding this are cancelled and error returned to caller
- Broadcast 'gpu-unavailable' event when WebGPU becomes permanently unavailable (context lost, GPU reset) so consumers can switch to WASM backends

### Claude's Discretion
- Exact queue depth within the 5-10 range
- Weighted fairness ratio (encoder:SLM turn allocation)
- Internal audit data structure and retention
- Exact timeout implementation (AbortController, Promise.race, etc.)

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

*Phase: 09-gpu-scheduler*
*Context gathered: 2026-02-20*
