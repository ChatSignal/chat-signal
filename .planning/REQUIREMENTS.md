# Requirements: Chat Signal Radar

**Defined:** 2026-02-20
**Core Value:** Real-time chat analysis must be accurate enough to be actionable — semantic clustering via encoder vectors replaces keyword matching for dramatically better message classification accuracy.

## v1.2 Requirements

Requirements for the Semantic AI Pipeline milestone. Each maps to roadmap phases.

### Encoder Integration

- [x] **ENC-01**: Transformers.js 3.x vendored into extension with ONNX WASM paths configured for MV3 CSP compliance
- [x] **ENC-02**: all-MiniLM-L6-v2 encoder auto-loads on extension startup without user consent (~23MB, cached after first download)
- [x] **ENC-03**: Messages encoded in batches (10-50) into 384-dimensional vectors via Transformers.js feature-extraction pipeline
- [x] **ENC-04**: WebGPU backend used for encoding when available, WASM backend as automatic fallback
- [x] **ENC-05**: Incremental encoding with message hash cache — only new messages re-encoded on each analysis cycle

### Semantic Clustering

- [ ] **CLU-01**: Prototype cosine routing classifies messages into 4 existing buckets (Questions, Issues/Bugs, Requests, General Chat) using pre-computed category prototype vectors
- [ ] **CLU-02**: Cosine similarity threshold (~0.35-0.45) determines classification; below-threshold messages default to General Chat

### GPU Scheduling

- [ ] **GPU-01**: Dedicated GPU scheduler module (`gpu-scheduler.js`) serializes WebGPU access between encoder and SLM via promise-queue mutex
- [ ] **GPU-02**: Encoder has priority 1 (runs every batch); SLM has priority 2 (waits for encoder to finish before starting)

### SLM Upgrade

- [ ] **SLM-01**: WebLLM model switched from Phi-2 to Qwen2.5-0.5B-Instruct-q4f16_1-MLC
- [ ] **SLM-02**: Prompt format updated to Qwen ChatML template (`<|im_start|>` / `<|im_end|>`)
- [ ] **SLM-03**: Response parser updated to handle Qwen2.5 output style (conversational preamble before structured content)
- [ ] **SLM-04**: Pre-clustered semantic groups from encoder passed into Qwen prompts for context-aware summarization

### Fallback & Integration

- [ ] **FBK-01**: WASM keyword clustering remains active as fallback when encoder hasn't loaded or AI is disabled
- [ ] **FBK-02**: Progressive model loading sequence: WASM first (~1-2s), then MiniLM (~25MB cached), then Qwen (consent-gated)
- [ ] **FBK-03**: Consent modal disclosure updated for Qwen2.5 model size (~950MB total)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Clustering Enhancements

- **CLU-03**: Adaptive cosine threshold tuning based on chat velocity
- **CLU-04**: Confidence scores surfaced in UI per classified message
- **CLU-05**: User-configurable prototype vectors for custom categories

### Performance

- **PERF-01**: Encoding batch size auto-tuning based on chat velocity
- **PERF-02**: WebGPU backend health monitoring with automatic fallback to WASM

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dynamic cluster discovery (K-Means/DBSCAN) | Fixed 4-bucket UI makes dynamic clustering add complexity with no benefit; prototype routing is O(n×4) and deterministic |
| Multiple SLM model choices in settings | Adds UI complexity and testing burden; single proven model is better for v1.2 |
| Encoder running in service worker | WebGPU unavailable in MV3 service workers; sidebar context is correct |
| Offscreen document for models | Unnecessary IPC overhead; sidebar has persistent lifetime and full WebGPU access |
| Export options (JSON/Markdown) | Candidate for future milestone |
| Platform expansion (Kick, Rumble) | Candidate for future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENC-01 | Phase 8 | Complete |
| ENC-02 | Phase 8 | Complete |
| ENC-03 | Phase 8 | Complete |
| ENC-04 | Phase 8 | Complete |
| ENC-05 | Phase 8 | Complete |
| CLU-01 | Phase 10 | Pending |
| CLU-02 | Phase 10 | Pending |
| GPU-01 | Phase 9 | Pending |
| GPU-02 | Phase 9 | Pending |
| SLM-01 | Phase 11 | Pending |
| SLM-02 | Phase 11 | Pending |
| SLM-03 | Phase 11 | Pending |
| SLM-04 | Phase 11 | Pending |
| FBK-01 | Phase 12 | Pending |
| FBK-02 | Phase 12 | Pending |
| FBK-03 | Phase 12 | Pending |

**Coverage:**
- v1.2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after roadmap creation*
