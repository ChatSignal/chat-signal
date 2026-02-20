# Architecture Research

**Domain:** Chrome Extension — Semantic AI Pipeline Integration (v1.2)
**Researched:** 2026-02-20
**Confidence:** HIGH (Chrome docs + Transformers.js docs verified; MLC model sizes from official HF repos)

---

## Context: What This Research Answers

The existing v1.1 architecture is stable and ships. This document answers six integration questions for the v1.2 Semantic AI Pipeline milestone:

1. Where should the Transformers.js encoder live? (sidebar context, background worker, or offscreen document)
2. Where should the GPU scheduler module live, and how does it coordinate encoder and WebLLM?
3. Data flow: Content Script → ? → Encoder → Clustering → SLM → UI — map the new pipeline.
4. How does WASM fallback mode work when encoder isn't ready?
5. Model loading lifecycle — when do MiniLM and Qwen load relative to extension startup?
6. What existing files need modification vs what's new?

---

## System Overview: New v1.2 Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│  YouTube / Twitch page                                           │
│  ┌────────────────────┐                                          │
│  │  content-script.js │ (UNCHANGED — DOM observer)              │
│  └────────┬───────────┘                                          │
└───────────┼──────────────────────────────────────────────────────┘
            │ chrome.runtime.sendMessage({ type: 'CHAT_MESSAGES' })
            ▼
┌──────────────────────┐
│   background.js      │ (UNCHANGED — simple relay)
│   Service Worker     │
└──────────┬───────────┘
           │ chrome.runtime.onMessage → sidebar receives
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  sidebar/sidebar.js  (MODIFIED — orchestrates new pipeline)     │
│                                                                 │
│  On CHAT_MESSAGES received:                                     │
│  1. Add to allMessages buffer (existing)                        │
│  2. If encoder ready → EncoderAdapter.encode(messages)          │
│     If encoder not ready → fallback: WASM analyze_chat()       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  encoder-adapter.js  [NEW]                              │    │
│  │  Transformers.js pipeline('feature-extraction',         │    │
│  │    'Xenova/all-MiniLM-L6-v2')                          │    │
│  │  → encodeMessages(texts): Float32Array[]               │    │
│  │  → clusterByCosine(embeddings, labels): ClusterBucket[]│    │
│  └──────────────────┬──────────────────────────────────────┘    │
│                     │ semantic clusters                          │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  gpu-scheduler.js  [NEW]                                │    │
│  │  Priority queue: encoder (P1) > SLM (P2)               │    │
│  │  Prevents simultaneous GPU use by encoder + WebLLM      │    │
│  └──────────────────┬──────────────────────────────────────┘    │
│                     │ releases GPU, signals SLM turn            │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  llm-adapter.js  [MODIFIED]                             │    │
│  │  Switch model: Phi-2 → Qwen2.5-0.5B-Instruct-q4f16_1  │    │
│  │  summarizeBuckets() receives pre-clustered groups       │    │
│  │  from encoder (not just raw WASM buckets)               │    │
│  └──────────────────┬──────────────────────────────────────┘    │
│                     │ summary text                              │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  WASM Engine (UNCHANGED as fallback)                    │    │
│  │  analyze_chat_with_settings() — fallback clustering     │    │
│  │  analyze_sentiment_signals() — always used              │    │
│  │  extract_topics() — always used                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  StateManager.js  (MODIFIED — adds encoderReady flag)           │
│  SessionManager.js  (UNCHANGED)                                 │
└─────────────────────────────────────────────────────────────────┘
                         │ chrome.storage (UNCHANGED)
                         ▼
             chrome.storage.local / chrome.storage.sync
```

---

## Q1: Where Does the Encoder Live?

**Answer: The sidebar document context. Not the background service worker, not an offscreen document.**

### Rationale

**The sidebar is a full browser page.** It has DOM access, WebGPU access, and persistent lifetime while the panel is open. Transformers.js runs its ONNX Runtime with WebGPU or WASM backend directly in a page context.

**Background service worker** — MV3 service workers are terminated after ~30 seconds of inactivity and restart on demand. Running a 25MB ONNX model inside a service worker means re-initializing it every time it wakes. Service workers also cannot access DOM APIs, which Transformers.js ONNX WASM fallback requires for memory allocation. WebGPU is available in service workers since Chrome 124, but the startup cost and termination problem make it unsuitable for a model that must be loaded once and kept warm.

**Offscreen document** — Chrome's `chrome.offscreen` API (Chrome 109+) creates a hidden document for DOM-dependent operations in MV3. It is the right solution when you need persistent DOM access from the background worker layer. However, the sidebar already is a persistent document. Adding an offscreen document solely for the encoder creates an unnecessary message-passing boundary (sidebar → background → offscreen → background → sidebar) and doubles the IPC overhead on every encode call. The sidebar lives as long as the user has it open, which is exactly the lifetime the encoder needs.

**Conclusion:** Transformers.js encoder (`encoder-adapter.js`) runs inside the sidebar's JavaScript context, alongside the existing WASM module. It is imported via ES module in `sidebar.js`, just as `llm-adapter.js` is today.

### WebGPU Access in Sidebar

The sidebar is rendered in Chrome's side panel, which is an extension page (`chrome-extension://...`). Extension pages have full access to WebGPU. The Transformers.js `pipeline()` with `device: 'webgpu'` will work. If WebGPU is unavailable (e.g., older hardware), Transformers.js automatically falls back to WASM/CPU backend for the encoder.

### CSP Change Required

The existing CSP is:
```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co ...
```

Transformers.js bundles ONNX Runtime WASM helpers that must be served locally. The MiniLM model files must be either:

- **Option A (recommended):** Fetched from HuggingFace on first use and cached in IndexedDB. Requires `https://huggingface.co` already in `connect-src` (already present). Set `env.allowRemoteModels = true` and `env.useBrowserCache = true`.
- **Option B:** Bundle the model files in the extension package at build time. Requires ~25MB added to extension zip. Set `env.allowRemoteModels = false` and `env.localModelPath = chrome.runtime.getURL('models/')`.

Option A is recommended because:
1. MiniLM (~25MB) auto-loads without consent — small enough that a one-time download is acceptable.
2. HuggingFace is already an allowed `connect-src` origin.
3. IndexedDB caching means subsequent loads are instant.
4. Extension zip stays under CWS size limits.

The Transformers.js ONNX WASM runtime helpers (`.wasm` files) must be bundled locally and pointed to via `env.backends.onnx.wasm.wasmPaths`. The existing `'wasm-unsafe-eval'` in CSP covers this.

---

## Q2: Where Does the GPU Scheduler Live?

**Answer: A new `gpu-scheduler.js` module in `extension/sidebar/modules/`, imported and instantiated in `sidebar.js`.**

### The Problem It Solves

Transformers.js (for MiniLM encoding) and WebLLM (for Qwen summary generation) both use WebGPU. If they run simultaneously, they contend for the same GPU command queue. WebGPU does not queue across separate API contexts — contention causes errors, slowdowns, or silent failures.

The encoder runs on every batch of messages (every ~5 seconds during active chat). The SLM runs on demand (user triggers summary, or periodic refresh). Without coordination, a summary generation can start mid-encode.

### Scheduler Design

```javascript
// gpu-scheduler.js — Priority queue pattern
class GPUScheduler {
  constructor() {
    this.queue = [];       // pending tasks
    this.running = false;  // GPU lock
  }

  // Priority 1 = highest (encoder), Priority 2 = lower (SLM)
  async schedule(fn, priority = 2) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, priority, resolve, reject });
      this.queue.sort((a, b) => a.priority - b.priority);
      this._drain();
    });
  }

  async _drain() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const { fn, resolve, reject } = this.queue.shift();
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    } finally {
      this.running = false;
      this._drain();
    }
  }
}
```

**Key behaviors:**
- Encoder calls schedule with `priority: 1` — always runs before pending SLM calls.
- SLM calls schedule with `priority: 2` — runs when encoder is idle.
- Tasks execute serially — never simultaneously.
- If encoder is frequent (every 5s) and SLM request queued, SLM runs after the in-flight encode completes. SLM calls are low-frequency (every 30s or on-demand), so queue depth stays small.

### Where It Lives

`extension/sidebar/modules/gpu-scheduler.js` — imported as a singleton in `sidebar.js`. Both `encoder-adapter.js` and `llm-adapter.js` receive the scheduler as a parameter (dependency injection), or `sidebar.js` wraps all calls to them through the scheduler. The latter is simpler: `sidebar.js` is the coordinator.

---

## Q3: Data Flow — Full New Pipeline

### Normal Flow (Encoder Ready, AI Enabled)

```
Content Script (DOM observer, every 5s)
  │
  │ chrome.runtime.sendMessage({ type: 'CHAT_MESSAGES', messages: [...] })
  ▼
background.js (relay only — UNCHANGED)
  │
  │ chrome.runtime.sendMessage(message)
  ▼
sidebar.js: chrome.runtime.onMessage handler
  │
  ├─ allMessages.push(...) — add to rolling buffer
  ├─ totalMessageCount++
  ├─ lastMessageTime = Date.now()
  │
  ├─ [EXISTING] wasmModule.analyze_chat_with_settings()
  │    → batchResult.sentiment_signals → accumulate sessionSentiment
  │    → topic extraction (still WASM, always)
  │
  ├─ windowMessages = allMessages.slice(-windowSize)
  │
  └─ gpuScheduler.schedule(() => encodeAndCluster(windowMessages), priority=1)
       │
       ▼
   encoder-adapter.js: encodeMessages(texts)
       │ Transformers.js pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
       │ → Float32Array[384] per message (384-dim MiniLM embeddings)
       │
       └─ clusterByCosine(embeddings, labels=['Questions','Issues','Requests','General'])
            │ Cosine similarity against per-category centroids
            │ → ClusterBucket[] (same shape as WASM output)
            ▼
   sidebar.js: renderClusters(semanticBuckets)  ← UI update (fast path)
       │
       └─ if (llmEnabled && isLLMReady && needsSummary):
            gpuScheduler.schedule(() =>
              llm-adapter.js: summarizeBuckets(semanticBuckets)
            , priority=2)
              │ Qwen2.5-0.5B-Instruct via WebLLM
              │ Prompt includes pre-clustered groups from encoder
              ▼
            sidebar.js: renderAISummary(summaryText)
```

### Fallback Flow (Encoder Not Ready or AI Disabled)

```
sidebar.js: chrome.runtime.onMessage handler
  │
  └─ if (!encoderReady):
       windowMessages = allMessages.slice(-windowSize)
       │
       wasmModule.analyze_chat_with_settings(windowMessages, ...)
         → result.buckets    (keyword clustering — existing)
         → result.topics     (existing)
         → result.sentiment_signals (existing)
       │
       renderClusters(result.buckets)
       │
       if (llmEnabled && isLLMReady):
         llm-adapter.js: summarizeBuckets(result.buckets)
```

**Important:** Sentiment analysis and topic extraction always go through WASM, even when the encoder is active. The encoder only replaces cluster bucket classification. WASM's `analyze_sentiment_signals` and `extract_topics` are not replaced.

### Data Shapes at Each Boundary

| Boundary | Data Shape | Notes |
|----------|------------|-------|
| Content Script → Background | `{ type, messages: [{text, author, timestamp}], platform, streamUrl, streamTitle }` | Unchanged |
| Background → Sidebar | Same message | Unchanged relay |
| Sidebar → EncoderAdapter | `string[]` (message texts, window slice) | New |
| EncoderAdapter → Sidebar | `ClusterBucket[]` (label, count, sample_messages) | Same shape as WASM output |
| Sidebar → LLMAdapter | `ClusterBucket[]` | Same shape — llm-adapter.js unchanged signature |
| LLMAdapter → Sidebar | `{ summary: string, ... }` | Unchanged |

The encoder output must match the WASM `ClusterBucket` shape exactly — this allows `renderClusters()` and `summarizeBuckets()` to be called identically regardless of whether buckets came from encoder or WASM.

---

## Q4: WASM Fallback Mode

### When Fallback Activates

WASM fallback is active in these conditions:

| Condition | Fallback Trigger |
|-----------|-----------------|
| Encoder not yet loaded | First 5-30 seconds after sidebar opens |
| Encoder model download in progress | While fetching MiniLM from HuggingFace |
| Encoder initialization error | ONNX load failure, WASM init failure |
| AI disabled by user | `settings.aiSummariesEnabled = false` covers both encoder and SLM |
| GPU unavailable | Transformers.js WASM backend fails on WebGPU error |

### Fallback Is Transparent to the UI

The `ClusterBucket[]` interface is the same for WASM output and encoder output. `renderClusters()` in `sidebar.js` receives the same data structure regardless of source. No UI state changes are needed for fallback — the clusters just come from WASM instead of the encoder.

### State Flag in StateManager

Add `encoderReady: false` to `StateManager.state`. `sidebar.js` checks this flag before scheduling encoder work:

```javascript
// In sidebar.js processMessages()
if (stateManager.encoderReady) {
  gpuScheduler.schedule(() => encodeAndCluster(windowMessages), 1);
} else {
  const result = wasmModule.analyze_chat_with_settings(...);
  renderClusters(result.buckets);
}
```

When `encoder-adapter.js` finishes loading (`pipeline()` resolves), it sets `stateManager.encoderReady = true`. From that point, all subsequent message batches use the encoder path.

### SLM Fallback (Unchanged from v1.1)

The SLM fallback (rule-based `generateFallbackSummary`) is already implemented in `llm-adapter.js`. Switching from Phi-2 to Qwen2.5 does not change the fallback logic — it only changes the `CreateMLCEngine` model ID string.

---

## Q5: Model Loading Lifecycle

### Startup Sequence

```
Extension icon clicked
  │
  ▼
background.js: chrome.sidePanel.open()
  │
  ▼
sidebar.html loads → sidebar.js executes
  │
  ├─ [Step 1] loadSettings() — chrome.storage.sync read
  │
  ├─ [Step 2] initWasm() — load wasm_engine.js + wasm_engine_bg.wasm
  │    (completes in ~1-2s, same as today)
  │    wasmModule becomes available
  │
  ├─ [Step 3] initEncoder() — NEW, runs after WASM
  │    import encoder-adapter.js
  │    pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {device: 'webgpu'})
  │    → model fetched from HuggingFace (first time: ~25MB download)
  │    → cached in IndexedDB (subsequent loads: <1s)
  │    stateManager.encoderReady = true
  │    statusText: "AI clustering ready"
  │
  └─ [Step 4] checkAISettings() — existing consent flow
       if (aiSummariesEnabled):
         initializeLLM() — Qwen2.5 (~945MB download, consent-gated)
         → model fetched from HuggingFace/MLC CDN
         → cached in IndexedDB
         llmEnabled = true
```

### Loading Priority

| Model | Size | Auto-load | Consent Required | Load Timing |
|-------|------|-----------|-----------------|-------------|
| WASM engine | ~200KB | Yes | No | Step 2, before encoder |
| MiniLM L6-v2 | ~25MB | Yes | No (auto-loads) | Step 3, after WASM |
| Qwen2.5-0.5B q4f16_1 | ~945MB | No | Yes | Step 4, after consent |

### During Loading (Encoder Not Yet Ready)

Between startup and Step 3 completing:
- Message batches use WASM fallback (existing behavior)
- Status bar shows "Loading AI clustering..." (new status message)
- UI displays WASM keyword clusters — no visible gap to user

### Model Caching

**MiniLM:** Transformers.js caches ONNX model files in browser's Cache API / IndexedDB automatically. `env.useBrowserCache = true` (default). After first download, loads in under 1 second.

**Qwen2.5:** WebLLM uses IndexedDB cache via `useIndexedDBCache: true` in `appConfig` (already in `llm-adapter.js`). After first download, loads in 5-15 seconds from local IndexedDB (decompression + GPU upload).

### Encoder Model ID to Use

`Xenova/all-MiniLM-L6-v2` — the Xenova (HuggingFace) port of `sentence-transformers/all-MiniLM-L6-v2` in ONNX format. This is the standard Transformers.js identifier for this model. It produces 384-dimensional sentence embeddings optimized for semantic similarity.

### Qwen Model ID for WebLLM

`Qwen2.5-0.5B-Instruct-q4f16_1-MLC` — confirmed available in MLC format on HuggingFace (`mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC` and q4f16 variants). The q4f16_1 quantization provides ~945MB VRAM usage, the most efficient variant. The model ID string for `CreateMLCEngine` changes from `'Phi-2-q4f16_1-MLC'` to `'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'`.

**Confidence note (MEDIUM):** The exact MLC model ID string should be verified against the current WebLLM `src/config.ts` model list on GitHub before implementation. Model IDs follow the pattern `<ModelFamily>-<Size>-<QuantFormat>-MLC`.

---

## Q6: New vs Modified Files

### New Files

| File | Location | Purpose |
|------|----------|---------|
| `encoder-adapter.js` | `extension/sidebar/` | Transformers.js pipeline wrapper. Loads MiniLM, exposes `encodeMessages()` and `clusterByCosine()`. Handles WASM fallback signaling. |
| `gpu-scheduler.js` | `extension/sidebar/modules/` | Priority queue for GPU task serialization. Coordinates encoder (P1) vs SLM (P2) WebGPU access. |

### Modified Files

| File | Change | Scope |
|------|--------|-------|
| `extension/sidebar/sidebar.js` | Import `encoder-adapter.js` and `gpu-scheduler.js`. Add `initEncoder()` call after `initWasm()`. Add `encoderReady` check in message handler. Route encoder output or WASM output through same `renderClusters()`. | Medium — adds ~60-80 lines, wraps existing processMessages() logic |
| `extension/llm-adapter.js` | Change `CreateMLCEngine` model ID from `Phi-2-q4f16_1-MLC` to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. Update `buildSummaryPrompt()` to accept pre-clustered semantic groups as context. Update consent modal disclosure text (~945MB vs ~400MB). | Small — model ID is 1 line, prompt template is ~10 lines |
| `extension/sidebar/modules/StateManager.js` | Add `encoderReady: false` to state. Add setter with boolean validation. | Small — ~6 lines |
| `extension/sidebar/sidebar.html` | Add Transformers.js script tag or import path. Update storage consent size disclosure (~950MB total: encoder 25MB + Qwen 945MB). Update status messages for encoder loading state. | Small — HTML additions |
| `extension/manifest.json` | Version bump to 1.2.0. CSP `connect-src` already includes `huggingface.co` — no addition needed. Possibly add `cdn.jsdelivr.net` if Transformers.js ONNX helpers load from jsdelivr (verify at build time). Update `unlimitedStorage` justification to include encoder. | Small |

### Unchanged Files

| File | Why Unchanged |
|------|---------------|
| `extension/background.js` | Pure relay — no awareness of AI pipeline |
| `extension/content-script.js` | DOM observer — output format unchanged |
| `extension/sidebar/modules/SessionManager.js` | Session lifecycle unaffected by clustering method |
| `extension/sidebar/utils/DOMHelpers.js` | Rendering utilities unchanged |
| `extension/sidebar/utils/ValidationHelpers.js` | Bucket validation schema unchanged (ClusterBucket shape same) |
| `extension/sidebar/utils/FormattingHelpers.js` | Display formatting unchanged |
| `extension/storage-manager.js` | Session persistence unchanged |
| `wasm-engine/src/lib.rs` | WASM functions unchanged — used as fallback and for sentiment/topics |
| Rust tests | 18 unit tests remain valid — WASM functions unchanged |

---

## Architectural Patterns

### Pattern 1: Shared Output Contract

**What:** Both the encoder and WASM produce `ClusterBucket[]` with the same shape. The UI and SLM consume this type without knowing or caring which source produced it.

**When to use:** When replacing a module (WASM clustering → semantic clustering) and wanting zero UI changes.

**Trade-offs:** Constrains encoder output to the existing bucket shape. The encoder cannot add new cluster categories without updating the rendering layer. Acceptable for v1.2 — the 4-category taxonomy (Questions, Issues, Requests, General Chat) is the product design, not an implementation artifact.

**Example:**
```javascript
// ClusterBucket — shared contract
// { label: string, count: number, sample_messages: string[] }

// Encoder path
const buckets = await encoderAdapter.clusterByCosine(embeddings, messages);
renderClusters(buckets);  // identical call

// WASM fallback path
const result = wasmModule.analyze_chat_with_settings(...);
renderClusters(result.buckets);  // identical call
```

### Pattern 2: Dependency-Injected GPU Scheduler

**What:** `sidebar.js` holds the `GPUScheduler` singleton and passes GPU work through it. Neither `encoder-adapter.js` nor `llm-adapter.js` knows about the scheduler — they expose plain async functions.

**When to use:** When two modules share a resource (GPU) but neither should be coupled to the other.

**Trade-offs:** `sidebar.js` becomes the coordinator for all GPU-bound operations. For v1.2 this is acceptable — `sidebar.js` is already the top-level orchestrator. If a third GPU-bound module is added later, this pattern scales cleanly.

**Example:**
```javascript
// In sidebar.js
const scheduler = new GPUScheduler();

// Encoding run (high priority)
const buckets = await scheduler.schedule(
  () => encoderAdapter.clusterMessages(windowMessages),
  1
);

// SLM summary (lower priority, runs after encoding)
const summary = await scheduler.schedule(
  () => llmAdapter.summarizeBuckets(buckets),
  2
);
```

### Pattern 3: Progressive Enhancement Loading

**What:** WASM loads first (fast, ~1-2s), encoder loads second (medium, ~1-5s first time), SLM loads last (slow, requires consent + ~945MB download). Each stage makes the product more capable without blocking the previous stage.

**When to use:** When models have wildly different sizes and loading times, and baseline functionality should be instant.

**Trade-offs:** Three separate loading stages add complexity to startup state machine. `sidebar.js` needs to track three readiness flags (`wasmReady`, `encoderReady`, `llmReady`). Worth the complexity — users see useful clustering immediately instead of waiting for all AI models.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running Encoder in Background Service Worker

**What people do:** Put Transformers.js initialization in `background.js` to persist between sidebar opens.

**Why it breaks:** MV3 service workers are terminated after ~30 seconds of inactivity. The 25MB ONNX model would need to re-initialize every time the worker wakes. More critically, ONNX WASM allocations cannot be transferred across worker restarts — there is no shared memory between service worker instances.

**Do this instead:** Initialize the encoder in the sidebar document. It persists as long as the user has the panel open, which is exactly the lifetime needed.

### Anti-Pattern 2: Encoding Every Individual Message

**What people do:** Call `pipeline()` on each new message as it arrives from the content script.

**Why it breaks:** MiniLM inference takes ~5-50ms per message on GPU. At high chat velocity (100+ messages/minute), individual encoding creates a continuous GPU backlog that starves the SLM and causes visible UI lag.

**Do this instead:** Encode the analysis window slice (`windowMessages`) as a batch on each 5-second cycle. Transformers.js handles batched inference efficiently. The encoding call processes the full window slice at once.

### Anti-Pattern 3: Tight-Coupling Encoder Output to SLM Input

**What people do:** Pass raw embedding vectors from the encoder directly to the SLM prompt.

**Why it breaks:** LLMs cannot process float32 embedding vectors. The encoder must produce readable cluster buckets (label + sample messages) before the SLM prompt is constructed. The SLM needs natural language context, not numeric vectors.

**Do this instead:** The encoder's output is human-readable `ClusterBucket[]`. The SLM receives the same bucket format as today, enhanced by the fact that groupings are now semantic rather than keyword-based. `buildSummaryPrompt()` in `llm-adapter.js` already handles this format.

### Anti-Pattern 4: Simultaneous WebGPU Contexts

**What people do:** Trigger SLM summary generation immediately when clusters are ready, while the encoder pipeline is still running.

**Why it breaks:** Transformers.js and WebLLM maintain separate WebGPU device instances. Concurrent command submissions from two contexts on the same physical GPU can cause errors or incorrect results on some hardware. GPU API contexts are not multiplexed automatically.

**Do this instead:** Route all GPU work through `GPUScheduler`. The encoder runs first (P1), the SLM runs second (P2). The scheduler ensures serial GPU access.

### Anti-Pattern 5: Removing WASM When Encoder Is Ready

**What people do:** Once the encoder is initialized, stop loading WASM entirely to save initialization time.

**Why it breaks:** The WASM engine still performs sentiment analysis and topic extraction — functions that are not replaced by the encoder. Removing WASM would eliminate these features.

**Do this instead:** Keep WASM always initialized. Use it for sentiment and topics regardless of encoder state. Use it for clustering only when encoder is not ready (fallback).

---

## Integration Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| sidebar.js ↔ encoder-adapter.js | Import + async function calls | Encoder is a plain ES module; scheduler wraps calls in sidebar.js |
| sidebar.js ↔ gpu-scheduler.js | Import + schedule() calls | Scheduler is a singleton created in sidebar.js |
| sidebar.js ↔ llm-adapter.js | Import + function calls (UNCHANGED) | summarizeBuckets() receives ClusterBucket[] — same as today |
| encoder-adapter.js ↔ Transformers.js | library import | Transformers.js bundle must be available as a local or CDN import |
| llm-adapter.js ↔ WebLLM | library import (UNCHANGED except model ID) | CreateMLCEngine call changes model string only |
| encoder-adapter.js ↔ HuggingFace | HTTP fetch for model files | connect-src already allows huggingface.co; model cached in IndexedDB |
| llm-adapter.js ↔ HuggingFace/MLC | HTTP fetch for Qwen weights (consent-gated) | Same flow as Phi-2 today |

---

## Build Order Recommendation

Dependencies drive this order:

**Phase 1 — GPU Scheduler (no external dependencies)**
Build `gpu-scheduler.js` first. It has zero external dependencies — pure JavaScript priority queue. Write unit tests. This module unblocks both encoder and SLM integration.

**Phase 2 — Encoder Adapter**
Build `encoder-adapter.js` with Transformers.js. Implement `encodeMessages()` and `clusterByCosine()`. Verify output shape matches `ClusterBucket[]`. This requires Transformers.js bundling decisions (local vs CDN) to be resolved first.

**Phase 3 — Sidebar Integration (encoder path)**
Wire `encoder-adapter.js` into `sidebar.js`. Add `initEncoder()` to startup sequence. Add `encoderReady` flag to `StateManager`. Add scheduler wrapping around encode calls. Test WASM fallback still works when encoder is disabled.

**Phase 4 — Qwen SLM Switch**
Update `llm-adapter.js` model ID. Update consent modal copy (size disclosure: ~950MB total). Update `buildSummaryPrompt()` to use semantic cluster context. Test with Qwen2.5 model.

**Phase 5 — End-to-End Integration**
Run full pipeline: content script → encoder → GPU scheduler → Qwen → UI. Verify WASM fallback path. Verify sentiment and topics still work via WASM in both paths.

**Dependency note:** Phase 4 (Qwen switch) is independent of Phase 2-3 (encoder). They can be developed in parallel if two workstreams are available. Both depend on Phase 1 (scheduler).

---

## Scaling Considerations

This extension runs entirely client-side. "Scaling" means handling high chat velocity and large analysis windows gracefully on user hardware.

| Concern | At 50 msg/5s batch | At 500 msg/5s batch | Mitigation |
|---------|-------------------|--------------------|----|
| Encoder inference time | ~10-50ms (GPU) | ~50-200ms (GPU) | Schedule P1, don't block UI thread |
| GPU memory | ~150MB (MiniLM loaded) | Same | One model load, kept warm |
| SLM inference time | ~2-10s | ~2-10s | Schedule P2, async, non-blocking |
| IndexedDB size | 25MB encoder + 945MB SLM | Same | Already handled by unlimitedStorage |
| WASM fallback latency | <5ms | ~20ms | Synchronous, always fast |

Encoder batch size is bounded by `analysisWindowSize` (default 500, max 1000). At 1000 messages, encoding all at once is inadvisable. Consider encoding only new messages since last cycle and using cached embeddings for older messages in the window — this is a v1.2+ optimization if profiling shows it's needed.

---

## Sources

- [Transformers.js v3 — WebGPU Support, New Models & Tasks](https://huggingface.co/blog/transformersjs-v3) — HIGH confidence
- [Transformers.js in Chrome Extension MV3 — practical patch](https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac) — MEDIUM confidence
- [Transformers.js + ONNX Runtime WebGPU in Chrome Extension](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9) — MEDIUM confidence
- [WebGPU in Service Workers — Chrome 124](https://developer.chrome.com/blog/new-in-webgpu-124) — HIGH confidence (Chrome official)
- [chrome.offscreen API Reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — HIGH confidence
- [WebGPU + WASM Unavailable in Service Workers — ONNX issue #20876](https://github.com/microsoft/onnxruntime/issues/20876) — HIGH confidence (confirmed pre-Chrome 124 limitation)
- [WebGPU + WASM Unavailable in Service Workers — Transformers.js issue #787](https://github.com/huggingface/transformers.js/issues/787) — HIGH confidence
- [mlc-ai/web-llm GitHub — Chrome Extension WebGPU Service Worker example](https://github.com/mlc-ai/web-llm/tree/main/examples/chrome-extension-webgpu-service-worker) — HIGH confidence
- [Xenova/all-MiniLM-L6-v2 on HuggingFace](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — HIGH confidence (model size ~25MB confirmed)
- [mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC on HuggingFace](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC) — HIGH confidence (q4f16_1 ~945MB VRAM confirmed)
- [Transformers.js env.allowRemoteModels + allowLocalModels — issue #791](https://github.com/huggingface/transformers.js/issues/791) — MEDIUM confidence
- [Transformers.js official docs](https://huggingface.co/docs/transformers.js/en/index) — HIGH confidence
- [WebLLM docs — Advanced Use Cases](https://webllm.mlc.ai/docs/user/advanced_usage.html) — HIGH confidence
- [Offscreen Documents in MV3 — Chrome Developers blog](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) — HIGH confidence

---

*Architecture research for: Semantic AI Pipeline Integration — Chat Signal Radar v1.2*
*Researched: 2026-02-20*
