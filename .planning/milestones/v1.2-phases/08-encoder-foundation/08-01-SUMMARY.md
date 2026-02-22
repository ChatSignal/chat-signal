---
phase: 08-encoder-foundation
plan: 01
subsystem: ai
tags: [transformers.js, onnx, webgpu, wasm, encoder, embeddings, chrome-extension, mv3]

# Dependency graph
requires: []
provides:
  - Transformers.js 3.x vendored into extension/libs/transformers/ (transformers.js + ort-wasm-simd-threaded.jsep.{wasm,mjs})
  - scripts/vendor-transformers.sh for reproducible vendoring after npm install
  - extension/manifest.json web_accessible_resources for Transformers.js and WASM engine files
  - encoder-adapter.js singleton with initEncoder, initEncoderWithRetry, encodeMessages, scheduleEncode, getEncoderState, getBackendInfo, resetEncoder
affects: [08-02-sidebar-integration, 09-gpu-scheduler, 10-semantic-clustering]

# Tech tracking
tech-stack:
  added:
    - "@huggingface/transformers 3.x (devDependency) — Transformers.js v3 with WebGPU support"
    - "Xenova/all-MiniLM-L6-v2 (model ID) — 384-dim sentence encoder, ~23MB at q8 quantization"
    - "ONNX Runtime Web (bundled in Transformers.js) — WebGPU + WASM inference backend"
  patterns:
    - "Vendor-script pattern: glob-based copy of dist files to extension/libs/ to avoid CDN fetches blocked by MV3 CSP"
    - "env.backends.onnx.wasm.wasmPaths set at module level before any pipeline() call (Pitfall 2 avoidance)"
    - "WebGPU detection with manual WASM fallback in try/catch (Pitfall 3 avoidance — Transformers.js does not auto-fallback)"
    - "Encoder singleton with in-flight promise guard to prevent double-init"
    - "djb2 hash cache (Map, 2000-entry FIFO cap) to skip re-encoding seen messages"
    - "Adaptive batch queue: flush at MAX_BATCH=50 or after TIME_FLUSH_MS=8000 timeout, min effective batch 10"

key-files:
  created:
    - extension/sidebar/encoder-adapter.js
    - scripts/vendor-transformers.sh
  modified:
    - extension/manifest.json
    - .gitignore
    - package.json

key-decisions:
  - "Glob-based vendor script (cp ort-wasm*) avoids file-list staleness after Transformers.js upgrades"
  - "wasmPaths points to vendored files via chrome.runtime.getURL('libs/transformers/') — mandatory for MV3 CSP compliance"
  - "WebGPU tried first, WASM fallback on catch — Transformers.js v3 does not auto-fallback from WebGPU"
  - "initEncoderWithRetry provides 3 attempts with exponential backoff (1s, 2s) and user-facing error strings for sidebar wiring"
  - "Hash cache bounded at 2000 entries (~3MB) with FIFO eviction via Map insertion-order iteration"
  - "TIME_FLUSH_MS=8000 chosen for slow chat tolerance per Claude's discretion noted in CONTEXT.md"

patterns-established:
  - "Encoder singleton: module-level state, in-flight promise guard, separate initEncoder/initEncoderWithRetry layers"
  - "All encoder logs prefixed [Encoder] to console.log only — no debug panel in sidebar"
  - "encodeMessages returns null (not throw) when pipeline not ready — caller must null-check"
  - "scheduleEncode/flushQueue pattern for adaptive batching decoupled from encode logic"

requirements-completed: [ENC-01, ENC-03, ENC-04, ENC-05]

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 8 Plan 01: Encoder Foundation — Transformers.js Vendoring and Encoder Adapter Summary

**Transformers.js 3.x vendored into Chrome MV3 extension with WebGPU/WASM pipeline, hash cache (2000 entries), adaptive batch queue (10-50 msgs, 8s timeout), and 3-attempt retry with exponential backoff**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-20T14:52:05Z
- **Completed:** 2026-02-20T14:54:31Z
- **Tasks:** 2
- **Files modified:** 5 (created 2, modified 3)

## Accomplishments
- Vendored Transformers.js 3.x and ONNX WASM companion files from node_modules into extension/libs/transformers/ via idempotent glob-based shell script
- Added web_accessible_resources to manifest.json so ONNX Runtime internal fetches can resolve vendored WASM/MJS files without CSP violations
- Created encoder-adapter.js: complete singleton module with WebGPU detection + WASM fallback, warm-up run, djb2 hash cache, adaptive batching, retry logic, and all 7 required exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Transformers.js, create vendor script, update manifest and gitignore** - `573cc3a` (chore)
2. **Task 2: Create encoder-adapter.js with full encoding pipeline** - `cd3743e` (feat)

**Plan metadata:** (committed with final docs commit)

## Files Created/Modified
- `extension/sidebar/encoder-adapter.js` — Encoder singleton: initEncoder, initEncoderWithRetry, encodeMessages, scheduleEncode, getEncoderState, getBackendInfo, resetEncoder
- `scripts/vendor-transformers.sh` — Idempotent script to copy Transformers.js + ort-wasm* files from node_modules to extension/libs/transformers/
- `extension/manifest.json` — Added web_accessible_resources for libs/transformers/*.{js,wasm,mjs} and wasm engine files
- `.gitignore` — Added /extension/libs/transformers/ (generated from node_modules)
- `package.json` — Added @huggingface/transformers as devDependency

## Decisions Made
- Used glob in vendor script (`cp ort-wasm*`) not enumerated filenames — avoids staleness after Transformers.js upgrades (Pitfall 6 in research)
- Set `env.backends.onnx.wasm.wasmPaths` at module level (lines 8-10) before any function definition — ensures ONNX Runtime sees the correct path on first pipeline() call
- WebGPU detection uses `navigator.gpu` + `requestAdapter()` check; failure caught and retried with `device: 'wasm'` — matches Transformers.js v3 behavior (no auto-fallback)
- initEncoderWithRetry resets `encoderState` and `initPromise` between retry attempts so initEncoder runs fresh
- TIME_FLUSH_MS=8000 chosen per Claude's discretion noted in CONTEXT.md (suitable range: 5s-10s)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- package-lock.json is gitignored (per existing .gitignore `package-lock.json` entry), so only package.json was staged for commit. Not a problem — intentional project convention.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- encoder-adapter.js is fully self-contained and ready for import by sidebar.js in Plan 02
- All 7 exports match the interface expected by Plan 02 (initEncoder, initEncoderWithRetry, encodeMessages, scheduleEncode, getEncoderState, getBackendInfo, resetEncoder)
- vendored files in extension/libs/transformers/ must be regenerated by running `bash scripts/vendor-transformers.sh` after any clone (same pattern as `./scripts/build.sh` for WASM artifacts)
- Progress event forwarding in initEncoder is wired through onProgress callback — Plan 02 will connect this to the sidebar progress bar UI

---
*Phase: 08-encoder-foundation*
*Completed: 2026-02-20*
