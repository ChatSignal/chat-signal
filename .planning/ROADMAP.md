# Roadmap: Chat Signal Radar

## Milestones

- ✅ **v1.0 Short-Term Improvements** — Phases 1-3 (shipped 2026-02-19)
- ✅ **v1.1 CWS Readiness** — Phases 4-6 (shipped 2026-02-20, Phase 7 deferred)
- 🚧 **v1.2 Semantic AI Pipeline** — Phases 8-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Short-Term Improvements (Phases 1-3) — SHIPPED 2026-02-19</summary>

- [x] Phase 1: Analysis Window (2/2 plans) — completed 2026-02-19
- [x] Phase 2: DOMPurify Integration (2/2 plans) — completed 2026-02-19
- [x] Phase 3: Configurable Thresholds (3/3 plans) — completed 2026-02-19

</details>

<details>
<summary>✅ v1.1 CWS Readiness (Phases 4-6) — SHIPPED 2026-02-20</summary>

- [x] Phase 4: Privacy and Dashboard Compliance (2/2 plans) — completed 2026-02-20
- [x] Phase 5: Manifest Audit and Disclosure UI (2/2 plans) — completed 2026-02-20
- [x] Phase 6: Store Listing Assets (2/2 plans) — completed 2026-02-20
- [ ] Phase 7: Verification and Submission — deferred (VERIF-01, VERIF-02 pending)

</details>

### 🚧 v1.2 Semantic AI Pipeline (In Progress)

**Milestone Goal:** Replace keyword-based clustering with MiniLM semantic encoding, add a GPU scheduler for WebGPU resource management, switch the SLM to Qwen2.5-0.5B-Instruct, and connect the full encoder-to-SLM pipeline with WASM as a permanent fallback.

- [x] **Phase 8: Encoder Foundation** — Vendor Transformers.js, load MiniLM, produce 384-dim embeddings (completed 2026-02-20)
- [ ] **Phase 9: GPU Scheduler** — Serialized WebGPU access between encoder and SLM
- [ ] **Phase 10: Semantic Cosine Routing** — Prototype vectors classify messages into 4 fixed buckets
- [ ] **Phase 11: Qwen SLM Swap** — Replace Phi-2 with Qwen2.5-0.5B, ChatML prompts, encoder pipeline
- [ ] **Phase 12: Integration and Hardening** — WASM fallback verified, loading sequence, consent update

## Phase Details

### Phase 8: Encoder Foundation
**Goal**: Users get semantic message clustering via a vendored MiniLM encoder that loads automatically on startup
**Depends on**: Nothing (first v1.2 phase)
**Requirements**: ENC-01, ENC-02, ENC-03, ENC-04, ENC-05
**Success Criteria** (what must be TRUE):
  1. The extension loads without CSP errors after Transformers.js and ONNX WASM files are vendored into `extension/libs/transformers/`
  2. MiniLM auto-loads on sidebar open without a consent prompt and produces 384-dimensional vectors for encoded messages
  3. Messages are encoded in batches (10-50) and only new messages are re-encoded on each analysis cycle (hash cache skips known messages)
  4. WebGPU backend is used for encoding when available; WASM backend activates automatically when WebGPU is absent
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Vendor Transformers.js, create encoder-adapter.js with encoding pipeline
- [ ] 08-02-PLAN.md — Sidebar progress bar UI, encoder lifecycle wiring, Settings backend info

### Phase 9: GPU Scheduler
**Goal**: A standalone GPU scheduler module serializes WebGPU access so encoder and SLM can never run concurrently
**Depends on**: Phase 8
**Requirements**: GPU-01, GPU-02
**Success Criteria** (what must be TRUE):
  1. `gpu-scheduler.js` exists in `extension/sidebar/modules/` and all GPU calls in `sidebar.js` route through it
  2. Encoder (priority 1) and SLM (priority 2) never execute simultaneously — timestamp logging confirms non-overlapping execution
  3. Queue depth is capped so that backlogged tasks do not compound into unbounded latency
**Plans**: 1 plan

Plans:
- [ ] 09-01-PLAN.md — Create gpu-scheduler.js module and wire into encoder pipeline

### Phase 10: Semantic Cosine Routing
**Goal**: Messages are classified into the four existing buckets by cosine similarity to prototype vectors, visibly outperforming keyword matching
**Depends on**: Phase 8, Phase 9
**Requirements**: CLU-01, CLU-02
**Success Criteria** (what must be TRUE):
  1. Prototype vectors are computed at encoder load from seed phrases for each of the 4 categories (Questions, Issues/Bugs, Requests, General Chat)
  2. Every message is assigned to exactly one bucket via cosine similarity; messages below threshold (~0.35) default to General Chat
  3. A "Semantic" or "Keyword" status badge in the UI shows which clustering mode is currently active
  4. Cluster assignments are deterministic — the same message always routes to the same bucket given the same prototype vectors
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

### Phase 11: Qwen SLM Swap
**Goal**: The SLM is switched to Qwen2.5-0.5B-Instruct with ChatML prompts that consume semantic cluster output for context-aware summaries
**Depends on**: Phase 9, Phase 10
**Requirements**: SLM-01, SLM-02, SLM-03, SLM-04
**Success Criteria** (what must be TRUE):
  1. `llm-adapter.js` uses `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` as the model ID and loads successfully via the existing consent-gated WebLLM flow
  2. Prompts use ChatML format (`<|im_start|>` / `<|im_end|>`) and produce parseable `MOOD:` / structured output reliably across 20+ sampled outputs
  3. The response parser locates structured content by scanning for first keyword occurrence, not by assuming line position, so Qwen preamble does not break parsing
  4. Semantic cluster groups from the encoder are passed into Qwen prompts and produce noticeably more specific summaries than the prior WASM-cluster input
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Integration and Hardening
**Goal**: The complete pipeline works end-to-end with verified fallback paths, a correct progressive loading sequence, and updated consent disclosure
**Depends on**: Phase 11
**Requirements**: FBK-01, FBK-02, FBK-03
**Success Criteria** (what must be TRUE):
  1. When the encoder is disabled or not yet loaded, WASM keyword clustering activates automatically and the sidebar renders correct results without any gaps
  2. On cold start the sidebar displays WASM cluster results within ~2 seconds, then upgrades to semantic clustering once MiniLM finishes loading (~5-30 seconds) — no blank render period
  3. The consent modal discloses the correct combined model size (~950MB total for Qwen2.5 + MiniLM) and the "Enable AI" button is gated on available storage
  4. Cache coexistence is confirmed: reopening the sidebar after a prior session warm-starts both MiniLM and Qwen without re-downloading either model
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Analysis Window | v1.0 | 2/2 | Complete | 2026-02-19 |
| 2. DOMPurify Integration | v1.0 | 2/2 | Complete | 2026-02-19 |
| 3. Configurable Thresholds | v1.0 | 3/3 | Complete | 2026-02-19 |
| 4. Privacy and Dashboard Compliance | v1.1 | 2/2 | Complete | 2026-02-20 |
| 5. Manifest Audit and Disclosure UI | v1.1 | 2/2 | Complete | 2026-02-20 |
| 6. Store Listing Assets | v1.1 | 2/2 | Complete | 2026-02-20 |
| 7. Verification and Submission | v1.1 | 0/? | Deferred | - |
| 8. Encoder Foundation | 2/2 | Complete   | 2026-02-20 | - |
| 9. GPU Scheduler | v1.2 | 0/? | Not started | - |
| 10. Semantic Cosine Routing | v1.2 | 0/? | Not started | - |
| 11. Qwen SLM Swap | v1.2 | 0/? | Not started | - |
| 12. Integration and Hardening | v1.2 | 0/? | Not started | - |
