# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Real-time chat analysis must be accurate enough to be actionable — semantic clustering via encoder vectors replaces keyword matching for dramatically better message classification accuracy.
**Current focus:** v1.2 Semantic AI Pipeline — Phase 8: Encoder Foundation

## Current Position

Phase: 8 of 12 (Encoder Foundation)
Plan: 1 of 3 complete in current phase
Status: In progress
Last activity: 2026-02-20 — 08-01-PLAN.md complete (encoder-adapter.js + Transformers.js vendoring)

Progress: [█░░░░░░░░░] ~6% (v1.2, 1/16 plans complete)

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
- Total plans completed: 1
- 08-01: ~3 min — 2 tasks, 5 files (Transformers.js vendoring, encoder-adapter.js)

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

### Pending Todos

None.

### Blockers/Concerns

- Phase 10 gate: cosine threshold default (0.35) needs calibration against live stream chat — literature values from support ticket domain, not stream chat
- Phase 11 gate: verify vendored `libs/web-llm/index.js` includes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig` before coding starts
- Phase 11 gate: Qwen2.5-0.5B structured output reliability is LOW confidence until 20+ real outputs validated
- sidePanel incognito behavior is MEDIUM confidence — deferred VERIF-01 from v1.1, still pending

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 08-01-PLAN.md (encoder-adapter.js + Transformers.js vendoring). Next: 08-02-PLAN.md (sidebar integration)
Resume file: None
