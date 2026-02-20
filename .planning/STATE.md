# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Real-time chat analysis must be accurate enough to be actionable — semantic clustering via encoder vectors replaces keyword matching for dramatically better message classification accuracy.
**Current focus:** v1.2 Semantic AI Pipeline — Phase 9: GPU Scheduler

## Current Position

Phase: 9 of 12 (GPU Scheduler)
Plan: 1 of 1 complete in current phase
Status: In progress
Last activity: 2026-02-20 — 09-01-PLAN.md complete (GPU scheduler module + encoder wiring)

Progress: [█░░░░░░░░░] ~19% (v1.2, 3/16 plans complete)

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 7
- Average duration per plan: ~1.9 min

**v1.1 Velocity:**
- Total plans completed: 6
- 04-01: ~23 min — 5 tasks, 5 files (privacy policy, CNAME, CWS justifications)
- 04-02: ~3 min — 2 tasks, 0 files (verification-only, human-action + auto)
- 05-01: ~1 min — 2 tasks, 2 files (manifest audit, CSP rationale)
- 05-02: ~2 min — 2 tasks, 3 files (consent modal disclosure, storage check)
- 06-01: ~2 min — 2 tasks, 4 files (store listing copy, promo image, npm deps)
- 06-02: ~4 min — 2 tasks, 4 files (Playwright screenshot script + three 1280x800 PNGs)

**v1.2 Velocity:**
- Total plans completed: 3
- 08-01: ~3 min — 2 tasks, 5 files (Transformers.js vendoring, encoder-adapter.js)
- 08-02: ~5 min — 2 tasks, 5 files (sidebar encoder progress bar, analysis gating, settings backend info)
- 09-01: ~2 min — 2 tasks, 3 files (GPU scheduler module, encoder-adapter wiring, sidebar event listener)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log.

Recent decisions affecting v1.2:
- Encode in sidebar page context (not background.js) — WebGPU unavailable in MV3 service workers
- Prototype cosine routing over K-Means/DBSCAN — deterministic, O(n×4), maps to fixed 4-bucket UI
- MiniLM auto-loads without consent (~25MB) — Qwen remains consent-gated (~950MB combined)
- GPU scheduler built before either WebGPU model is active — prevents device loss or OOM

Decisions from 08-01 execution:
- Glob-based vendor script avoids file-list staleness after Transformers.js upgrades
- wasmPaths set at module level (before function definitions) — mandatory for MV3 CSP compliance
- WebGPU detection with manual WASM fallback (Transformers.js v3 does not auto-fallback)
- initEncoderWithRetry resets state+promise between retries so initEncoder runs fresh
- TIME_FLUSH_MS=8000 chosen for slow chat tolerance (range noted: 5-10s)

Decisions from 08-02 execution:
- encoderReady + getEncoderState() === 'loading' gate prevents analysis rendering during model download; falls through on error for WASM fallback
- allMessages module-level buffer used for catch-up encoding (StateManager.js is dormant in sidebar.js)
- Encoder init is fire-and-forget (no await) in initWasm() — WASM analysis works immediately
- Options page reads encoderBackend from chrome.storage.local (not sync) — backend is device-specific

Decisions from 09-01 execution:
- GPU scheduler built as hand-rolled promise-chain mutex (no npm dependency needed for two task types)
- MAX_QUEUE_DEPTH=8 (mid-range 5-10), ENCODER_BURST_LIMIT=4 (4:1 ratio), AUDIT_SIZE=20 ring buffer
- scheduleGpuTask wraps only pipeline inference calls, not pipeline creation or cache operations
- registerDevice() requests a second GPUDevice reference solely for device.lost watcher (Transformers.js holds primary device internally)
- gpu-unavailable listener in sidebar.js sets encoderReady=false — analysis gate falls through to WASM-only mode, no UI indicator needed

### Pending Todos

None.

### Blockers/Concerns

- Phase 10 gate: cosine threshold default (0.35) needs calibration against live stream chat — literature values from support ticket domain, not stream chat
- Phase 11 gate: verify vendored `libs/web-llm/index.js` includes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig` before coding starts
- Phase 11 gate: Qwen2.5-0.5B structured output reliability is LOW confidence until 20+ real outputs validated
- sidePanel incognito behavior is MEDIUM confidence — deferred VERIF-01 from v1.1, still pending

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 09-01-PLAN.md (GPU scheduler module + encoder wiring). Phase 9 complete.
Resume file: None
