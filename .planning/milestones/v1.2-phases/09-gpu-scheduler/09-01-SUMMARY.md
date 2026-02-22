---
phase: 09-gpu-scheduler
plan: 01
subsystem: gpu
tags: [webgpu, promise-mutex, queue, scheduler, encoder, transformers-js]

# Dependency graph
requires:
  - phase: 08-encoder-foundation
    provides: encoder-adapter.js with WebGPU/WASM backend, encoderPipeline inference calls to wrap

provides:
  - Promise-chain GPU scheduler module serializing all WebGPU access between encoder and SLM
  - GPU device-loss detection via registerDevice() + gpu-unavailable CustomEvent
  - Encoder inference (warm-up + encodeMessages) routed through scheduleGpuTask
  - Sidebar gpu-unavailable listener that falls back to WASM-only mode

affects:
  - 10-semantic-routing (will call encodeMessages which now goes through scheduler)
  - 11-qwen-slm (will add scheduleGpuTask('slm', 2, ...) in llm-adapter.js)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise-chain mutex for serial GPU task execution (_tail pattern)
    - Weighted-slot fairness counter (ENCODER_BURST_LIMIT=4) for starvation prevention
    - AbortSignal.timeout() for 30-second GPU task timeout
    - CustomEvent dispatch on window for in-page module-decoupled signalling
    - Circular audit log ring buffer for non-overlapping execution verification

key-files:
  created:
    - extension/sidebar/modules/gpu-scheduler.js
  modified:
    - extension/sidebar/encoder-adapter.js
    - extension/sidebar/sidebar.js

key-decisions:
  - "MAX_QUEUE_DEPTH=8 (mid-range of locked 5-10 range)"
  - "ENCODER_BURST_LIMIT=4 (4:1 encoder:SLM fairness ratio)"
  - "AUDIT_SIZE=20 (20-entry ring buffer for non-overlapping verification)"
  - "registerDevice() requests a second GPUDevice reference solely for device.lost watcher — Transformers.js holds the primary device internally"
  - "scheduleGpuTask wraps only the pipeline inference call, not pipeline creation or cache operations"
  - "gpu-unavailable listener in sidebar.js sets encoderReady=false to fall through analysis gate to WASM-only mode"

patterns-established:
  - "Promise-chain mutex: _tail = _tail.then(async () => { ... }).catch(() => {}) — silently absorbs errors in _tail to prevent chain breakage while returning errors to callers normally"
  - "Weighted-slot fairness: _consecutiveEncoderRuns counter + ENCODER_BURST_LIMIT — after N encoder runs force one SLM slot regardless of queue order"

requirements-completed: [GPU-01, GPU-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 9 Plan 1: GPU Scheduler Summary

**Promise-chain mutex GPU scheduler with priority queue, starvation prevention, 30s timeout, and device-loss detection — encoder inference routed through scheduler**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T19:08:35Z
- **Completed:** 2026-02-20T19:10:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `gpu-scheduler.js` (187 lines) with full promise-chain mutex, priority queue, 4:1 fairness, 30s timeout, device-loss detection, and 20-entry audit log
- Wired encoder-adapter.js to route both warm-up inference and `encodeMessages` pipeline calls through `scheduleGpuTask('encoder', 1, ...)`
- Added `gpu-unavailable` event listener in sidebar.js that sets `encoderReady = false` to fall back to WASM-only analysis on permanent GPU loss

## Task Commits

Each task was committed atomically:

1. **Task 1: Create gpu-scheduler.js module** - `82459e0` (feat)
2. **Task 2: Wire GPU scheduler into encoder-adapter and sidebar** - `fca3bcd` (feat)

**Plan metadata:** [committed with SUMMARY.md]

## Files Created/Modified

- `extension/sidebar/modules/gpu-scheduler.js` - GPU task serialization module with promise-chain mutex, priority queue, audit log, timeout, device-loss detection; exports scheduleGpuTask, getStatus, registerDevice
- `extension/sidebar/encoder-adapter.js` - Added gpu-scheduler import, warm-up and encodeMessages inference wrapped in scheduleGpuTask, registerDevice call after warm-up
- `extension/sidebar/sidebar.js` - Added gpu-unavailable CustomEvent listener setting encoderReady=false

## Decisions Made

- `MAX_QUEUE_DEPTH = 8` — mid-range of locked 5-10 range; 8 provides comfortable headroom for bursty chat without retaining too many stale batches
- `ENCODER_BURST_LIMIT = 4` — 4:1 encoder:SLM ratio; Phase 11 SLM inference is much slower so 4 encoder slots before forcing one SLM slot avoids encoder starvation of SLM without significantly slowing encoder throughput
- `AUDIT_SIZE = 20` — 20 entries is enough to verify non-overlapping execution across several seconds of activity; memory-only, no console output
- `registerDevice()` requests a second `GPUDevice` reference solely to attach the `device.lost` watcher. Transformers.js holds the primary device internally and doesn't expose it. This second device shares the same underlying GPU adapter and will receive the same loss events.
- Wrapped only the pipeline inference calls (not pipeline creation or cache operations). Only inference touches the GPU; creation and cache are CPU-only.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GPU scheduler complete and ready for Phase 10 (semantic routing will call `encodeMessages` → `scheduleGpuTask` automatically)
- Phase 11 readiness: `llm-adapter.js` will import `scheduleGpuTask` with `type='slm'` and `priority=2` when Qwen is wired in — no changes needed to `gpu-scheduler.js`
- `getStatus()` available for Phase 11 debugging of concurrent GPU access

---
*Phase: 09-gpu-scheduler*
*Completed: 2026-02-20*
