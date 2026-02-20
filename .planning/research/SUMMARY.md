# Project Research Summary

**Project:** Chat Signal Radar — v1.2 Semantic AI Pipeline
**Domain:** In-browser ML pipeline for Chrome Extension (MV3) — semantic encoder + SLM upgrade
**Researched:** 2026-02-20
**Confidence:** MEDIUM-HIGH overall (stack and architecture HIGH; SLM prompt effectiveness at 0.5B scale LOW until tested)

## Executive Summary

Chat Signal Radar v1.2 upgrades the existing keyword-based clustering engine (Rust/WASM) to a semantic vector approach using Transformers.js and the `Xenova/all-MiniLM-L6-v2` ONNX model (~25MB), and replaces the Phi-2 WebLLM SLM with `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. The core algorithm is prototype cosine routing: each incoming message is encoded to a 384-dim embedding and assigned to the nearest of four fixed category prototypes (Questions, Issues, Requests, General Chat) by cosine similarity. This is a deliberate choice over K-Means or DBSCAN — the UI has four fixed buckets, prototype routing is deterministic and O(n×4) fast, and it maps directly to the existing UI without additional logic. Everything runs in-browser in the sidebar page context; no server is involved.

The recommended architecture keeps the existing components largely intact. Content script, background relay, WASM engine (for sentiment and topics), session management, and all UI rendering are unchanged. Two new modules are added: `encoder-adapter.js` (Transformers.js wrapper with MiniLM loading and cosine routing) and `gpu-scheduler.js` (promise-queue GPU serializer). Both Transformers.js and WebLLM use WebGPU and share the same physical GPU adapter — they must never run concurrently, and the scheduler is the enforcement mechanism. The WASM engine is retained as the permanent clustering fallback until the encoder signals ready, and for all sentiment and topic extraction regardless of encoder state.

The highest-risk area is the Transformers.js integration into MV3. The library's ONNX Runtime WASM helpers are fetched from CDN by default, which MV3 CSP blocks silently. This must be solved with a one-time vendor step (esbuild bundle + manual WASM file copy into `extension/libs/transformers/`) and `env.backends.onnx.wasm.wasmPaths` set before any `pipeline()` call. The Qwen model swap is relatively low-risk — the API is identical, only the model ID string changes — but prompt re-tuning for Qwen2.5-0.5B's smaller capacity and different ChatML format is a required task that must be validated with real model output, not assumed to work from the existing Phi-2 prompts.

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md` for full details.

The extension's existing stack (Rust/WASM, vanilla JS ES modules, MV3, DOMPurify) is frozen. The v1.2 additions are: `@huggingface/transformers` 3.x (stable at 3.8.1; do not use 4.x preview) vendored as a local ESM bundle, and `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` replacing Phi-2 in the existing WebLLM setup. No new runtime npm packages are added to the extension itself — all new files are vendored into `extension/libs/transformers/` following the same pattern as DOMPurify and WebLLM. The MiniLM model downloads automatically from HuggingFace (~25MB, no consent required) and caches via browser Cache API. Qwen continues through the existing consent-gated flow but triggers a fresh download due to the model ID change.

**Core technologies:**
- `@huggingface/transformers` 3.8.1: Sentence encoder pipeline — produces 384-dim embeddings; ONNX Runtime WASM/WebGPU backends; v3 is stable, v4 is beta and must not be used
- `Xenova/all-MiniLM-L6-v2` (ONNX, q8 quantized): Sentence embedding model — ~25MB, purpose-built for semantic similarity, first-class Transformers.js support
- `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`: Replacement SLM — ~944MB VRAM (vs ~1570MB for Phi-2), smaller download, modern instruct-tuned; reuses existing Qwen2-0.5B WASM in WebLLM
- GPU Scheduler (pure JS, new module): Serializes WebGPU access between Transformers.js and WebLLM — no library needed, simple promise-queue pattern

**Critical version and compatibility notes:**
- Use `@huggingface/transformers@3` not `@xenova/transformers` (deprecated v2) and not v4 (preview)
- ONNX Runtime WASM: use the version bundled with Transformers.js 3.x; do not install `onnxruntime-web` separately
- WebLLM bundle: verify bundled `libs/web-llm/index.js` includes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig`; may require re-downloading the WebLLM bundle if the current version predates Qwen2.5 support
- Chrome 113+ required for WebGPU in extension pages; Chrome 114+ required for sidePanel — overlap is fine

### Expected Features

See `.planning/research/FEATURES.md` for full details.

**Must have (table stakes) — ship in v1.2:**
- Semantic clustering that produces visibly better message grouping than keyword matching
- Zero regression in analysis latency — encoding runs async without blocking the UI thread
- Graceful fallback to WASM keyword clustering while encoder loads and on encoder failure
- Qwen2.5-0.5B model swap with updated ChatML prompts that produce parseable structured output
- GPU scheduler preventing concurrent encoder/SLM GPU use
- Incremental batch encoding (not full-window re-encode every cycle) with message hash cache

**Should have (differentiators) — v1.2 or v1.2.x:**
- Prototype-based category routing with fixed seed-phrase anchors per category (not K-Means)
- WASM-signal hybrid routing for edge cases (cosine score + WASM sentiment flag for Questions and Issues)
- "Semantic" vs "Keyword" status badge so users can see which mode is active
- WebGPU backend for encoder (faster than WASM; add after scheduler proven stable)

**Defer to v1.3+:**
- Streaming SLM output (adds scheduler complexity; minimal UX value for summary context)
- Dynamic cluster discovery (variable K) — incompatible with fixed 4-bucket UI
- Embedding-based deduplication replacing text-hash dedup
- Threshold tuning UI in options page

**Anti-features — do not build:**
- Consent modal for the encoder model (25MB is not consent-scale; friction is unjustified)
- DBSCAN/HDBSCAN or agglomerative clustering (O(n²) in JS at 500-message windows; breaks fixed-bucket UI)
- K-Means re-clustering at every batch (non-deterministic; makes UI appear unstable)
- Full window re-encode on every analysis cycle (5-15s GPU time for 500 messages; defeats real-time feel)
- Running encoder or SLM in background.js (service workers have no WebGPU access)

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for full details.

The v1.2 pipeline inserts cleanly between the existing message relay and UI rendering. Content script and background.js are unchanged. The sidebar's `processMessages()` gains a branch: if `encoderReady`, route through `encoder-adapter.js` via the GPU scheduler; otherwise fall through to existing WASM `analyze_chat_with_settings()`. Both paths produce `ClusterBucket[]` with identical shape, so `renderClusters()` and `summarizeBuckets()` are called identically from either path. WASM sentiment and topic extraction always run regardless of encoder state. The three key architectural patterns are: shared output contract (encoder and WASM produce the same `ClusterBucket[]` type), dependency-injected GPU scheduler (`sidebar.js` holds the singleton and wraps all GPU calls), and progressive enhancement loading (WASM ready in ~2s, encoder in ~5-30s first time, SLM consent-gated).

**Major components:**
1. `encoder-adapter.js` (new) — Transformers.js wrapper: loads MiniLM, computes 4 prototype vectors at startup from seed phrases, exposes `encodeMessages()` and `clusterByCosine()`
2. `gpu-scheduler.js` (new, in `modules/`) — Priority-queue GPU serializer: encoder=P1, SLM=P2; promise-based mutex, serial execution only
3. `sidebar.js` (modified) — Orchestrator: adds `initEncoder()` to startup sequence, `encoderReady` flag check in message handler, scheduler wrapping of all GPU calls
4. `llm-adapter.js` (modified) — Model ID change (Phi-2 → Qwen2.5-0.5B), prompt rewrite for ChatML format, `max_tokens: 300`, `temperature: 0.3`
5. `StateManager.js` (modified) — Adds `encoderReady: false` flag (~6 lines)

**Unchanged:** background.js, content-script.js, SessionManager.js, all utils (DOMHelpers, ValidationHelpers, FormattingHelpers), storage-manager.js, wasm-engine lib.rs, all 18 Rust unit tests

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full details.

1. **ONNX WASM files blocked by MV3 CSP** — Transformers.js fetches ONNX Runtime helpers from CDN by default; this fails silently in MV3 extensions (confirmed: Transformers.js issue #1248). Prevention: vendor WASM files into `extension/libs/transformers/`, set `env.backends.onnx.wasm.wasmPaths` before any `pipeline()` call, declare files in `web_accessible_resources`. All three steps required together. Blocking prerequisite for everything else.

2. **Concurrent WebGPU contexts cause GPU hang or OOM** — Transformers.js and WebLLM share the GPU adapter. Simultaneous calls cause device loss, OOM, or silent result corruption (confirmed: WebLLM issue #517). Prevention: GPU scheduler module must be built first, before integrating either model. Never run both without coordination even in development.

3. **Qwen2.5-0.5B prompt format incompatibility** — Phi-2 prompts use QA format; Qwen2.5 uses ChatML (`<|im_start|>` / `<|im_end|>`). At 0.5B scale, Qwen frequently prepends conversational preamble before structured output, breaking parsers that expect `MOOD:` on line 1. Prevention: rewrite prompts to ChatML format, validate `parseSentimentResponse()` against 20+ actual Qwen outputs, update parser to scan for first keyword occurrence rather than assuming line position.

4. **Encoder initialization blocking first render** — If encoder init is awaited before rendering, the sidePanel shows blank for 10-30 seconds on cold start. Prevention: fire encoder init as a non-blocking background task with `.catch()`; render WASM results immediately; upgrade to semantic when encoder signals ready via `encoderReady` flag.

5. **Mean pooling required on MiniLM output** — `pipeline('feature-extraction', ...)` returns per-token tensors from `last_hidden_state`, not sentence embeddings. Mean pooling + L2 normalization is required before cosine similarity. Skipping this produces meaningless vectors where all messages score similarly against all prototypes.

6. **Transformers.js/WebLLM cache coexistence** — Both libraries cache to the same extension origin. Cache eviction or WebLLM API changes (e.g., `useIndexedDBCache` option name) can cause unexpected re-downloads. Prevention: keep `unlimitedStorage` in manifest (already present in v1.1), pin library versions, log storage backend used at init.

## Implications for Roadmap

The build order is determined by a hard dependency chain: GPU scheduler has no external dependencies; encoder requires the WASM path vendor strategy resolved first; sidebar integration requires both encoder and scheduler; Qwen validation requires encoder output as prompt input. The suggested phases follow this dependency order.

### Phase 1: Transformers.js Vendoring and Encoder Foundation

**Rationale:** Four of seven critical pitfalls must be addressed before any other work. The ONNX WASM path configuration, no-bundler vendor strategy, encoder lifecycle state machine, and service worker constraint all surface in the first integration step. Building the encoder correctly from the start prevents cascading failures in every subsequent phase. Nothing else works until `env.backends.onnx.wasm.wasmPaths` is correctly configured.

**Delivers:** Transformers.js vendored locally in `extension/libs/transformers/` via one-time esbuild build step documented in `scripts/build.sh`; `encoder-adapter.js` loading MiniLM and producing `ClusterBucket[]` output; WASM fallback state machine with `encoderReady` flag in StateManager; loading indicator in UI; no consent modal (auto-loads silently)

**Features:** Semantic clustering with WASM fallback, zero latency regression, MiniLM auto-load without consent

**Avoids:** Pitfall 1 (ONNX WASM CSP), Pitfall 4 (cold start blocking render), Pitfall 5 (mean pooling), pitfall of running in background service worker

**Research flag:** Standard patterns — official Transformers.js MV3 tutorial covers WASM path configuration exactly; no additional research needed

### Phase 2: GPU Scheduler

**Rationale:** The GPU scheduler has zero external dependencies and must exist before either WebGPU-accelerated model is active. Building it second ensures the scheduling contract is in place when both models share the GPU in Phase 4 end-to-end testing. Testing the scheduler in isolation (with mock GPU tasks) is faster and more reliable than debugging GPU contention live.

**Delivers:** `gpu-scheduler.js` in `extension/sidebar/modules/` with priority queue (encoder=P1, SLM=P2), serial execution guarantee; `sidebar.js` wired to route all GPU calls through the scheduler; queue depth cap to prevent unbounded latency compounding; unit tests for serialization behavior

**Avoids:** Pitfall 2 (concurrent WebGPU contexts / GPU hang or OOM)

**Research flag:** Standard patterns — simple promise-mutex, well-documented; no additional research needed

### Phase 3: Semantic Cosine Routing

**Rationale:** With the encoder loading correctly (Phase 1) and scheduler in place (Phase 2), prototype vector computation and cosine routing can be implemented and validated against real chat data. This phase produces the visible quality improvement that justifies the milestone. The cosine threshold (default 0.35) is the primary unknown and requires calibration against live stream chat.

**Delivers:** Prototype vector computation at encoder load (4 categories × 3-5 seed phrases averaged to 384-dim vectors); incremental message hash cache bounded at analysis window size; cosine similarity routing to 4 fixed buckets with `THRESHOLD = 0.35` (tunable); WASM-signal hybrid assists for Questions/Issues edge cases; "Semantic"/"Keyword" status badge in UI

**Features:** Prototype-based routing (not K-Means), incremental batch encoding (~10-20 message batches on 10-15s timer matching existing analysis cycle), deterministic cluster assignments

**Uses:** GPU scheduler (P1 priority wrapping encoder calls), MiniLM 384-dim embeddings

**Research flag:** Needs validation — cosine threshold 0.35-0.45 range comes from intent-classification literature on support tickets, not live stream chat. Plan to log bucket assignments vs WASM assignments for 2-3 test streams and tune threshold before declaring done.

### Phase 4: Qwen2.5 SLM Swap and Prompt Re-Tuning

**Rationale:** The model ID change is one line, but prompt re-tuning for Qwen2.5-0.5B's ChatML format and smaller capacity is a first-class task. This phase is separated from Phase 3 because the SLM prompt is best validated after real semantic cluster output is available from Phase 3. The Qwen integration is also independent of Phases 2-3 from a code standpoint and can be developed in parallel if resources allow, but prompt validation requires Phase 3 output.

**Delivers:** `llm-adapter.js` with Qwen2.5-0.5B model ID (`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`), ChatML prompt template in `buildSummaryPrompt()`, `parseSentimentResponse()` hardened against Qwen preamble (scan for first keyword occurrence), `max_tokens: 300`, `temperature: 0.3`; updated consent modal storage disclosure (~950MB total = 25MB encoder + ~945MB Qwen); cache coexistence verified between MiniLM and Qwen; prompt injection prevention (200-char message truncation before SLM input); SLM output through `safeSetHTML`

**Avoids:** Pitfall 3 (Qwen prompt format), Pitfall 6 (cache coexistence), prompt injection from adversarial chat messages

**Research flag:** Needs validation — SLM prompt effectiveness at 0.5B is LOW confidence until tested with real model output. Log 20+ raw Qwen outputs; confirm `MOOD:` and JSON appear consistently. If output format is unreliable, update parser before shipping.

### Phase 5: End-to-End Integration and Hardening

**Rationale:** Each prior phase produces a working component in isolation. This phase wires everything together and validates the complete pipeline under realistic conditions: high chat velocity, cold start, cache clear, WebGPU unavailable, encoder failure. The "looks done but isn't" checklist from PITFALLS.md is the exit criteria for this phase.

**Delivers:** Full pipeline verified (content script → encoder → scheduler → Qwen → UI); WASM fallback path explicitly tested by throwing from encoder init and confirming WASM renders; cache coexistence confirmed — both models warm-start without re-download on sidePanel reopen; GPU scheduler non-overlap confirmed via timestamp logging; manifest version bump to 1.2.0; WebGPU backend for encoder enabled if scheduler proven stable (P2 feature upgrade)

**Avoids:** All pitfalls verified against "looks done but isn't" checklist — mean pooling correctness, model ID valid in WebLLM prebuiltAppConfig, fallback path active on failure, cache coexistence

**Research flag:** Standard patterns — integration testing and verification; no additional research needed

### Phase Ordering Rationale

- Phase 1 is a hard blocker: the ONNX WASM path failure is silent and breaks everything downstream. Resolving this first prevents wasted time debugging "the encoder doesn't work" in Phase 3.
- Phase 2 before Qwen active: GPU scheduler must exist before both models touch the GPU. This is non-negotiable — even development testing with both models active without a scheduler risks GPU device loss.
- Phase 3 before Phase 4 prompt validation: The Qwen prompt consumes semantic cluster output. Validating Qwen prompts without real semantic clusters means testing with WASM clusters, which does not surface format differences in the prompt inputs.
- Phase 4 Qwen-encoder parallel option: Phases 3 and 4 can be coded in parallel (code is independent). But end-to-end validation must run in order — encoder first, then Qwen consuming encoder output.
- Phase 5 is non-optional: Several "looks done but isn't" pitfalls (mean pooling, model ID in prebuiltAppConfig, fallback path activation on failure, cache coexistence) are easy to miss and have been observed as real failure modes in comparable integrations.

### Research Flags

Phases needing validation during execution:
- **Phase 3 (Cosine Routing):** Threshold tuning (0.35 default) needs calibration against real stream chat before finalizing. Plan 2-3 calibration sessions with live streams. A threshold too low routes everything to the nearest prototype; too high routes everything to General.
- **Phase 4 (Qwen Prompts):** Treat prompt engineering as a deliverable, not a polish item. Validate with at minimum 20 raw model outputs before shipping. If output format is unreliable at 0.5B, the rule-based fallback in `llm-adapter.js` is the safety net.
- **Pre-Phase 4 gate:** Verify the vendored `libs/web-llm/index.js` includes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig` before starting Phase 4 coding. If not present, re-download the WebLLM bundle first.

Phases with standard/well-documented patterns (skip additional research):
- **Phase 1:** Official HuggingFace MV3 tutorial + confirmed GitHub issues provide explicit, tested patterns
- **Phase 2:** Simple promise-mutex; no novel design decisions
- **Phase 5:** Integration testing; no research gap

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Transformers.js 3.8.1 verified current on npm; model sizes from official HF repos; WASM path pattern from official tutorial + confirmed issue tracker |
| Features | MEDIUM-HIGH | Prototype routing rationale well-supported by literature; cosine threshold 0.35-0.45 from intent-classification literature (MEDIUM, needs live stream calibration); SLM prompt quality at 0.5B untested (LOW) |
| Architecture | HIGH | Chrome extension MV3 constraints from official docs; WebGPU sidePanel availability from Chrome docs; service worker limitation from confirmed issue tracker entries |
| Pitfalls | HIGH for MV3/CSP mechanics, MEDIUM for WebGPU contention | CSP and WASM path pitfalls confirmed via issue tracker; GPU hang behavior is specified but partly implementation-defined across hardware |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Cosine threshold calibration:** The 0.35-0.45 range comes from intent detection literature on support tickets, not live stream chat. Chat messages are shorter and more colloquial. Address during Phase 3 execution via 2-3 calibration test streams before setting the final default.

- **Qwen2.5-0.5B structured output reliability:** Whether the model produces consistently parseable `MOOD:` / JSON output at 0.5B scale depends on the exact prompt and sampling parameters. This cannot be confirmed without running the model. Treat prompt validation as a blocking requirement for Phase 4 completion sign-off.

- **WebLLM bundle Qwen2.5 support:** STACK.md has MEDIUM confidence on whether the vendored WebLLM bundle includes Qwen2.5-0.5B in its `prebuiltAppConfig` (based on GitHub issue tracker, not merged config.ts). Check this before starting Phase 4.

- **`useIndexedDBCache` API name in llm-adapter.js:** PITFALLS.md flags this option name may have changed in newer WebLLM versions. Verify against the WebLLM API reference for the vendored bundle version before finalizing Phase 4.

- **Mean pooling correctness:** Validate implementation against a known sentence pair before routing real messages. Cosine similarity of "What is this?" and "How does this work?" should return ~0.85 with properly pooled MiniLM embeddings. This is a verification step, not a research gap, but must not be skipped.

## Sources

### Primary (HIGH confidence)
- [@huggingface/transformers npm](https://www.npmjs.com/package/@huggingface/transformers) — version 3.8.1 confirmed current stable
- [Transformers.js v3 announcement](https://huggingface.co/blog/transformersjs-v3) — v3 feature set including WebGPU backend
- [Transformers.js v4 Preview](https://huggingface.co/blog/transformersjs-v4) — v4 is preview/beta, not production-ready
- [Transformers.js browser extension tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/browser-extension) — official MV3 wasmPaths pattern
- [Xenova/all-MiniLM-L6-v2 on HuggingFace](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — model ID, 384-dim embeddings, ~25MB ONNX weights confirmed
- [Qwen2.5-0.5B-Instruct on HuggingFace](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) — model capabilities, ChatML template format
- [mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC) — MLC format confirmed, q4f16_1 ~945MB VRAM
- [mlc-ai/phi-2-q4f16_1-MLC on HuggingFace](https://huggingface.co/mlc-ai/phi-2-q4f16_1-MLC) — Phi-2 repo size 1.57 GB
- [Transformers.js Issue #1248](https://github.com/huggingface/transformers.js/issues/1248) — CDN fetch blocked in MV3 confirmed
- [Transformers.js Issue #787](https://github.com/xenova/transformers.js/issues/787) — WebGPU/WASM unavailable in service worker confirmed
- [Chrome WebGPU documentation](https://developer.chrome.com/docs/web-platform/webgpu) — WebGPU available in extension pages (not service workers)
- [WebGPU in Service Workers — Chrome 124](https://developer.chrome.com/blog/new-in-webgpu-124) — service worker WebGPU context limitation
- [WebLLM GitHub](https://github.com/mlc-ai/web-llm) — Qwen model support, ChatCompletion API
- [WebLLM API Reference](https://webllm.mlc.ai/docs/user/api_reference.html) — CreateMLCEngine signature, model reload
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu) — device and dtype options
- [MV3 Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — `wasm-unsafe-eval` approved; remote code fetch blocked
- [Chrome for Developers — Cache models in the browser](https://developer.chrome.com/docs/ai/cache-models) — Cache API preferred for large models
- [Qwen2.5 release blog](https://qwenlm.github.io/blog/qwen2.5/) — JSON output improvements, instruction following at 0.5B

### Secondary (MEDIUM confidence)
- [Running Transformers.js in Chrome MV3 — Medium](https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac) — wasmPaths + web_accessible_resources pattern (community source, consistent with official docs)
- [Qwen2.5-0.5B-Instruct-q4f16_1-MLC — PromptLayer](https://www.promptlayer.com/models/qwen25-05b-instruct-q4f161-mlc-feee) — 944MB VRAM (secondary source, consistent with quantization math)
- [WebLLM Issue #683](https://github.com/mlc-ai/web-llm/issues/683) — Qwen2.5-0.5B in prebuiltAppConfig (issue tracker, not merged config.ts)
- [WebLLM Issue #490](https://github.com/mlc-ai/web-llm/pull/490) — Qwen2.5-0.5B reuses Qwen2-0.5B WASM (PR, not release notes)
- [WebLLM Issue #517](https://github.com/mlc-ai/web-llm/issues/517) — GPU OOM and device lost behavior confirmed
- [Clustering Sentence Embeddings for Intent Detection — Towards Data Science](https://towardsdatascience.com/clustering-sentence-embeddings-to-identify-intents-in-short-text-48d22d3bf02e/) — cosine threshold 0.35-0.45 range for short text
- [WebGPU Concurrency Guide — SitePoint](https://www.sitepoint.com/the-webgpu-concurrency-guide-mastering-async-compute-shaders/) — GPU queue serialization with promise chains
- [Transformers.js WebGPU performance benchmark](https://huggingface.co/posts/Xenova/906785325455792) — up to 64x speedup over WASM for large batches

---
*Research completed: 2026-02-20*
*Ready for roadmap: yes*
