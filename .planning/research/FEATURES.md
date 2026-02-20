# Feature Research: Semantic AI Pipeline

**Domain:** In-browser semantic encoder + SLM pipeline for live chat analysis
**Milestone:** v1.2 Semantic AI Pipeline
**Researched:** 2026-02-20
**Confidence:** MEDIUM-HIGH (core Transformers.js + Qwen facts HIGH; GPU scheduler patterns MEDIUM; SLM prompt effectiveness at 0.5B LOW until tested)

---

## Context

Chat Signal Radar already ships keyword-based clustering (Rust/WASM), lexicon-based sentiment, and WebLLM-powered AI summaries via Phi-2. The v1.2 milestone replaces two pieces:

1. **Clustering engine:** keyword → semantic vector (Transformers.js + all-MiniLM-L6-v2, ~25MB)
2. **SLM:** Phi-2 → Qwen2.5-0.5B-Instruct (smaller, faster, better instruction following)

The WASM keyword engine is retained as a fallback when AI models are disabled or unloaded. All processing stays in-browser; no server. GPU contention between the encoder and SLM requires a scheduler module.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These features must exist for the semantic pipeline to be a meaningful upgrade. Without them, the milestone is a regression disguised as a feature.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Semantic clustering that visibly improves message grouping | The entire point of the upgrade. If keyword results and semantic results look the same, there is no perceived value. | MEDIUM | Cosine similarity threshold routing to 4 fixed buckets. Threshold of 0.35–0.45 cosine similarity to category prototype vectors is the working range for short chat messages (per intent-classification literature). |
| Zero regression in analysis latency | Existing users see real-time updates. Encoding must not block the UI thread. | HIGH | Encoding must run in a Web Worker. MiniLM inference is ~50–100ms per batch on modern hardware via WASM backend; WebGPU can be 10-64x faster but adds GPU contention risk with the SLM. Start with WASM backend for the encoder; upgrade to WebGPU only after scheduler is in place. |
| Graceful fallback to WASM when encoder not loaded | Encoder takes time to load (~25MB download + model init). Users on slow connections must still get clustering. | MEDIUM | WASM keyword clustering remains the active path until Transformers.js signals ready. StateManager.js should track an `encoderReady` flag. |
| Model swap from Phi-2 to Qwen2.5-0.5B-Instruct | Existing users who enabled AI summaries have Phi-2 cached (~400MB). Switching models requires handling the cache transition. | MEDIUM | WebLLM model ID changes from `Phi2-q4f16_1-MLC` to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (944MB VRAM, ~400MB download). Cache keys differ — old cached model is not reused. Users may need to re-download. |
| SLM prompts that produce useful summaries at 0.5B scale | Qwen2.5-0.5B-Instruct has strong instruction following for its size but will hallucinate on long, unconstrained prompts. | HIGH | Prompts must be short, tightly constrained, and pass pre-clustered data as structured input (see SLM Prompt Patterns section below). |
| Encoder-to-SLM pipeline: cluster data feeds summaries | The stated goal. Semantic cluster labels and representative messages must be passed to the SLM as context. | MEDIUM | GPU scheduler serializes the two operations: encode batch → cluster → format → SLM summarize. Never run both simultaneously. |

---

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Prototype-based category routing (not blind K-Means) | Fixed 4-bucket UI requires mapping semantic space to known categories, not discovering unknown clusters. Prototype vectors for "question", "issue", "request", and "general" anchor the semantic space to the existing UI. | MEDIUM | Pre-compute prototype embeddings at encoder load time using seed phrases per category (e.g., "how do I", "this is broken", "please add"). Each new message is assigned to the nearest prototype by cosine similarity. Avoids K-Means instability and the need to choose K. |
| GPU scheduler as a standalone module | Prevents encoder and SLM from contending for WebGPU, which causes both to time out or produce garbage. This is an architectural differentiator — most in-browser AI demos ignore this problem and use single-model pipelines. | HIGH | Promise-queue based scheduler: operations are enqueued with priority (encoder=1, SLM=2); only one GPU op runs at a time; caller awaits resolution. See Architecture section. |
| Incremental batch encoding (not full-window re-encode) | Re-encoding the full analysis window (500 messages) every update cycle wastes GPU time and creates latency spikes. Encoding only new messages and merging results keeps latency flat. | MEDIUM | Maintain an embedding cache keyed by message hash. Only encode messages not seen before. Cluster assignments are re-run on the full cached set, but encoding is incremental. |
| SLM context window discipline | 0.5B models degrade sharply when the prompt exceeds ~400-600 tokens. Passing only cluster summaries (not raw messages) into the SLM prompt keeps the input compact and improves output quality. | LOW | Format: system prompt (≤80 tokens) + per-cluster summary (≤60 tokens each × 4 clusters) + instruction (≤30 tokens) = ~500 tokens total. Never pass raw message lists to the SLM. |

---

### Anti-Features (Do Not Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Dynamic cluster count (auto-detect K) | "Let the AI find the real topics" — sounds more intelligent | The UI has 4 fixed buckets. Dynamic K produces variable output that cannot map cleanly to Questions/Issues/Requests/General. Also requires DBSCAN or HDBSCAN, which are expensive to run in JS at every update cycle. | Prototype-based routing with cosine threshold. Messages that score below threshold for all 4 prototypes go to General. This handles the "doesn't fit" case without dynamic K. |
| DBSCAN / HDBSCAN clustering | Better for arbitrary cluster shapes; no K assumption | O(n²) distance matrix is expensive in JS at 500-message windows. Requires epsilon tuning per chat velocity. No stable mapping to 4 fixed UI buckets. | Cosine similarity to fixed prototypes. Simpler, faster, and directly maps to the existing UI. |
| Agglomerative hierarchical clustering | Theoretically good for short text | Requires full pairwise distance matrix (O(n²) memory, O(n² log n) time). At 500 messages with 384-dim vectors, this is a 500×500 float matrix computed in JS every update cycle. Not viable in the browser at this scale. | Prototype nearest-neighbor. O(n × 4) — linear in messages, trivially fast. |
| Full window re-encode on every analysis cycle | "Fresh results" — ensures nothing is stale | MiniLM on 500 messages takes 5-15 seconds even with WebGPU, blocking GPU for the SLM. Defeats real-time feel. | Incremental encoding with message hash cache. New messages only. Re-cluster on full cached set with prototype routing (matrix multiply is cheap vs. encoding). |
| Streaming SLM output to UI | Looks impressive; used in chat interfaces | WebLLM supports streaming, but streaming partial summaries into the sidebar while the encoder also wants GPU creates interleaving complexity that breaks the scheduler. Adds implementation cost with minimal UX value in a summary context. | Batch SLM output: generate complete summary, then render. Scheduler stays simple. |
| Consent modal for the encoder model | "Be consistent with WebLLM consent flow" | MiniLM is only ~25MB. The existing consent flow is gated on the ~400MB WebLLM download. Adding a second consent modal for a 25MB model creates unnecessary friction and implies the encoder collects user data (it does not — it's a pure math operation). | Auto-load the encoder silently. Disclose encoder usage in the privacy policy and on the options page. |
| Real-time per-message encoding | Maximum accuracy — every message encoded immediately | One message per encode call wastes GPU setup overhead. Encoding throughput is maximized with batches of 8-32 messages. Per-message encoding would also starve the SLM of GPU time. | Batch on a timer: collect messages for 10-15 seconds, then encode the batch. Balances latency and throughput. |
| K-Means re-clustering at every batch | Common ML pattern | K-Means is iterative and non-deterministic (random initialization). Results change on every run for similar inputs, making the UI appear unstable. Assignment to prototypes is deterministic. | Prototype cosine routing. Same message → same bucket on every run. Stable UI. |

---

## Algorithm Recommendation: Prototype Cosine Routing

**Decision:** Use cosine similarity to fixed category prototype vectors. Not K-Means. Not DBSCAN.

**Rationale:**

1. The UI is fixed at 4 buckets. Dynamic cluster discovery (K-Means, DBSCAN) produces variable-K output that requires a separate mapping step to the fixed buckets — adding complexity without benefit.

2. Prototype routing is O(n × 4) — linear in messages, trivially fast in JS after encoding is done.

3. Short chat messages (typically 3-15 words) cluster well by prototype proximity because intent signals ("how do", "not working", "please add") dominate the semantic vector even in short text. (Source: Towards Data Science, clustering sentence embeddings for intent detection.)

4. Cosine similarity is deterministic given the same encoding. The UI remains stable across analysis cycles.

**Implementation:**

```javascript
// Seed phrases per category (3-5 per category, averaged to form prototype vector)
const PROTOTYPES = {
  questions:  ["how do I", "what is", "can you explain", "does this work with", "where is"],
  issues:     ["this is broken", "not working", "error", "bug", "crash", "it stopped"],
  requests:   ["please add", "would be great if", "feature request", "can you make", "I wish"],
  general:    ["lol", "great stream", "hype", "nice", "thanks"]
};

// At encoder load time: encode all seed phrases, average per category → 4 prototype vectors (384-dim each)

// At analysis time: for each new message embedding, compute cosine similarity to all 4 prototypes.
// Assign to the highest-scoring category. If max score < THRESHOLD (0.35), assign to General.
const THRESHOLD = 0.35; // Tune based on observed chat data; 0.35-0.45 is the expected working range
```

**Prototype vector refresh:** Do NOT re-compute prototypes from accumulated messages. Fixed seed-phrase prototypes are intentional anchors, not cluster centroids. Re-computing them would cause category drift.

---

## Batch Size and Encoding Frequency

**Recommendation:** Encode in batches of 10-20 messages, on a 10-15 second timer.

**Rationale:**

- MiniLM encoding throughput improves with batch size (amortizes GPU setup overhead). Batches of 8-32 are optimal for WebGPU backend; WASM backend is less sensitive.
- Existing analysis cycle runs every ~10 seconds. Encoder batch cadence should match this. Don't add a second independent timer.
- At 500-message analysis window with new-message-only encoding: most cycles will encode 5-30 new messages (typical live chat velocity). This is a trivial GPU workload.
- Full cold-start encode (all 500 messages, first cycle): runs once at encoder init. Budget ~2-5 seconds with WASM backend; ~200-500ms with WebGPU backend.

**Cache strategy:** Hash message text (or use index + content tuple). Store `(message_hash → embedding_vector)` in a Map. Evict on analysis window slide (oldest messages drop out). This bounds memory: 500 messages × 384 floats × 4 bytes = ~768KB — well within browser limits.

---

## SLM Prompt Patterns for Qwen2.5-0.5B-Instruct

**Model characteristics (confirmed):**
- WebLLM model ID: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- VRAM: ~944MB (fits in consumer GPU alongside encoder if scheduled)
- Context window: 4096 tokens (supports structured input up to ~3000 tokens)
- Strengths at 0.5B: instruction following, JSON output, short structured summaries
- Weaknesses at 0.5B: multi-step reasoning, factual recall, long coherent prose

**Prompt template (recommended):**

```
<|im_start|>system
You are a live chat analyst. Summarize each chat category concisely.
<|im_end|>
<|im_start|>user
Analyze this live stream chat data:

QUESTIONS (12 messages): Top: "Does this work on Mac?", "What's the plugin called?", "How do I install?"
ISSUES (3 messages): Top: "extension crashed", "keeps disconnecting"
REQUESTS (7 messages): Top: "please add dark mode", "export to CSV", "keyboard shortcut"
GENERAL (45 messages): Mood: excited. Top topics: "pog", "LUL", "hype"

Provide a 1-sentence summary per category. Output JSON:
{"questions":"...","issues":"...","requests":"...","general":"..."}
<|im_end|>
<|im_start|>assistant
```

**Key constraints for 0.5B models:**

1. Use the Qwen chat template format (`<|im_start|>` / `<|im_end|>`). WebLLM applies this automatically when using the chat API, but raw completion requires it explicitly.

2. Pass pre-processed cluster data, not raw messages. Include: message count, top 2-3 representative messages (truncated to 60 chars each), and mood/topic signals from the WASM engine. Never pass the full message list.

3. Request JSON output explicitly. Qwen2.5 has improved JSON generation vs. Phi-2. The 0.5B model reliably produces valid JSON for 4-key flat objects when explicitly requested.

4. Keep total prompt under 500 tokens. Budget: system prompt (≤80 tokens) + 4 cluster blocks (≤80 tokens each) + instruction (≤40 tokens) = ~440 tokens. Leaves 3500+ tokens for output (well above the ~200 tokens a 4-key JSON response uses).

5. Set `max_tokens` to 300. Prevents the model from generating verbose prose when JSON is expected. WebLLM `ChatCompletion` API: set `max_tokens: 300`.

6. Use `temperature: 0.3` for summaries. Low temperature reduces hallucination and keeps output structured. Not zero (avoids repetition loops that some small models exhibit).

**Fallback:** The existing rule-based summarizer in `llm-adapter.js` remains unchanged as the fallback when Qwen is not loaded. The prompt format change is in `llm-adapter.js`'s `summarizeBuckets()` function — replace the existing Phi-2 prompt with the Qwen chat template format above.

---

## Mapping Semantic Clusters to the Existing 4-Bucket UI

**Decision:** Semantic clusters map 1:1 to the 4 existing UI buckets. No UI changes required.

The UI buckets (Questions, Issues/Bugs, Requests, General Chat) are not abstract categories to be discovered — they are the product's defined output. The semantic encoder replaces the keyword matching used to route messages into these buckets, but the buckets themselves are unchanged.

**Routing rules:**

| Bucket | Prototype seed phrases | Overflow rule |
|--------|------------------------|---------------|
| Questions | "how do I", "what is", "can you explain", "does this", "where is" | Messages with `?` in text AND cosine score below threshold → Questions (text fallback) |
| Issues/Bugs | "not working", "broken", "error", "crash", "bug" | Messages with strong negative sentiment AND low threshold → Issues |
| Requests | "please add", "would be great", "feature request", "can you make" | None — low-confidence requests go to General |
| General Chat | "lol", "nice", "hype", "great", "thanks" | Default bucket for all messages below THRESHOLD on all 4 prototypes |

**Text-signal assists:** The WASM engine already extracts sentiment signals and identifies `?`-terminated messages. These signals can be combined with cosine scores to improve edge cases:
- If cosine score for Questions > 0.25 AND message contains `?`: route to Questions (lower effective threshold)
- If cosine score for Issues > 0.25 AND WASM sentiment is negative: route to Issues

This hybrid routing (semantic primary + WASM-signal assist) avoids the cold-start accuracy gap while the encoder is learning.

**No new UI components required.** The existing cluster bucket cards, message lists, and count badges are reused without modification. The semantic engine is a drop-in replacement for the WASM routing logic in the analysis pipeline.

---

## Feature Dependencies

```
Transformers.js encoder (auto-loads, ~25MB)
    └──required by──> Prototype vector computation (runs once at encoder load)
                          └──required by──> Per-message cosine routing
                                                └──required by──> Semantic cluster assignment
                                                                      └──feeds──> SLM prompt builder

GPU Scheduler module
    └──required by──> WebGPU encoder (if device: 'webgpu' is used)
    └──required by──> Qwen2.5 SLM via WebLLM
    └──serializes──> encoder batch → SLM summarize (never concurrent)

WASM keyword clustering (existing)
    └──serves as──> Fallback when encoder not ready
    └──provides──> Sentiment signals that assist cosine routing edge cases

WebLLM SLM swap (Phi-2 → Qwen2.5-0.5B-Instruct)
    └──requires──> Updated prompt format in llm-adapter.js
    └──requires──> Cache invalidation for existing Phi-2 users (model ID change)
    └──consumes──> Semantic cluster data from encoder pipeline
```

### Dependency Notes

- **GPU Scheduler before WebGPU encoder:** If Transformers.js uses the WASM backend (default), the scheduler is only needed for Qwen. If WebGPU is enabled for the encoder, the scheduler gates both. Ship scheduler first; enable WebGPU for encoder in a later pass.
- **Encoder before SLM prompt change:** The SLM prompt format changes to accept pre-clustered semantic data. The new prompt cannot be validated without real cluster output from the encoder.
- **WASM fallback must remain functional:** The encoder load path is async and may fail. The WASM fallback must remain the default until `encoderReady` is confirmed. Test the fallback path explicitly.
- **Phi-2 cache conflict:** Existing users with Phi-2 cached will not automatically get Qwen. WebLLM uses the model ID as the cache key. When `llm-adapter.js` changes the model ID, the first run triggers a fresh ~400MB download. This is expected behavior; the consent modal flow handles it (consent remains stored, but the new model downloads fresh).

---

## MVP Definition (This Milestone)

### Ship in v1.2

- [ ] Transformers.js integration loading `Xenova/all-MiniLM-L6-v2` in a Web Worker — enables encoding without blocking UI thread
- [ ] Prototype vector computation at encoder load (4 category prototypes from seed phrases)
- [ ] Incremental batch encoding with message hash cache — only new messages per cycle
- [ ] Cosine similarity routing to 4 fixed buckets with THRESHOLD = 0.35 (tunable)
- [ ] WASM keyword clustering retained as fallback until `encoderReady = true`
- [ ] GPU scheduler module (promise queue, priority: encoder=1, SLM=2, serialize GPU ops)
- [ ] Qwen2.5-0.5B-Instruct-q4f16_1-MLC as the WebLLM SLM (replaces Phi-2)
- [ ] Updated `summarizeBuckets()` prompt in `llm-adapter.js` using Qwen chat template + pre-clustered input
- [ ] Existing consent modal flow reused for Qwen download (new model ID triggers re-download)

### Add After Validation (v1.2.x)

- [ ] WebGPU backend for encoder (upgrade from WASM after scheduler is proven stable) — trigger: scheduler ships and is stable in testing
- [ ] Threshold tuning UI in options page — trigger: user feedback shows misrouting patterns
- [ ] WASM-signal assist for edge-case routing (combine cosine + WASM sentiment flags) — trigger: observed accuracy gap in Questions and Issues buckets

### Defer to v1.3+

- [ ] Streaming SLM output — adds scheduler complexity; minimal UX value for summary context
- [ ] Dynamic cluster discovery (variable K) — incompatible with fixed 4-bucket UI without additional mapping layer
- [ ] Embedding-based deduplication (replacing text-hash dedup) — medium complexity, low priority vs. routing accuracy

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Semantic cosine routing to 4 buckets | HIGH — visible improvement in message grouping | MEDIUM — encoder + prototype logic | P1 |
| Transformers.js Web Worker integration | HIGH — required to avoid UI blocking | MEDIUM — Worker message protocol | P1 |
| WASM fallback preserved | HIGH — regression prevention | LOW — already exists; add `encoderReady` flag | P1 |
| GPU scheduler module | HIGH — prevents encoder/SLM GPU conflict | MEDIUM — promise queue + priority logic | P1 |
| Qwen2.5 model swap + prompt update | HIGH — SLM quality improvement | LOW-MEDIUM — model ID + prompt rewrite | P1 |
| Incremental encoding with hash cache | MEDIUM — latency management | MEDIUM — cache Map + eviction on window slide | P1 |
| WebGPU backend for encoder | MEDIUM — speed improvement on capable hardware | HIGH — adds GPU contention risk; needs scheduler first | P2 |
| Threshold tuning in options page | LOW — edge case accuracy | LOW — one more settings field | P3 |
| WASM-signal hybrid routing | MEDIUM — edge-case accuracy (Questions, Issues) | LOW — OR condition on existing signals | P2 |

**Priority key:**
- P1: Must have for v1.2 to be a meaningful upgrade
- P2: Should add once core is working
- P3: Nice to have, future consideration

---

## Sources

- [Xenova/all-MiniLM-L6-v2 — Hugging Face](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — 384-dim, 128 token max, ~25MB, ONNX weights confirmed (HIGH)
- [Transformers.js v3 release notes — Hugging Face Blog](https://huggingface.co/blog/transformersjs-v3) — WebGPU backend, WASM default, batch encoding API confirmed (HIGH)
- [Qwen2.5-0.5B-Instruct — Hugging Face](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) — model capabilities, chat template format (HIGH)
- [Qwen2.5-0.5B-Instruct-q4f16_1-MLC — PromptLayer](https://www.promptlayer.com/models/qwen25-05b-instruct-q4f161-mlc-feee) — MLC model ID, 944MB VRAM, WebLLM support (MEDIUM)
- [WebLLM — GitHub mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) — Qwen model support, ChatCompletion API (HIGH)
- [Clustering Sentence Embeddings for Intent Detection — Towards Data Science](https://towardsdatascience.com/clustering-sentence-embeddings-to-identify-intents-in-short-text-48d22d3bf02e/) — cosine threshold 0.35-0.45 range for short text intent clustering (MEDIUM)
- [Semantic Clustering of User Messages — Towards Data Science](https://towardsdatascience.com/tutorial-semantic-clustering-of-user-messages-with-llm-prompts/) — silhouette + ward linkage for intent grouping (MEDIUM)
- [DBSCAN vs K-Means for text — comparing clustering algorithms](https://hdbscan.readthedocs.io/en/latest/comparing_clustering_algorithms.html) — HDBSCAN recommended over DBSCAN for short text; both impractical for browser at this scale (MEDIUM)
- [Qwen2.5 release blog — Qwen team](https://qwenlm.github.io/blog/qwen2.5/) — JSON output improvements, instruction following at 0.5B (HIGH)
- [WebGPU Concurrency Guide — SitePoint](https://www.sitepoint.com/the-webgpu-concurrency-guide-mastering-async-compute-shaders/) — GPU queue serialization with promise chains (MEDIUM)
- [Transformers.js WebGPU performance benchmark — @Xenova on Hugging Face](https://huggingface.co/posts/Xenova/906785325455792) — up to 64x speedup over WASM for large batches (MEDIUM)

---
*Feature research for: semantic encoder + SLM pipeline — Chat Signal Radar v1.2*
*Researched: 2026-02-20*
