# Stack Research — Semantic AI Pipeline

**Domain:** In-browser ML pipeline for a Chrome Extension (MV3) — sentence encoder + SLM swap
**Researched:** 2026-02-20
**Milestone:** v1.2 — Semantic AI Pipeline (subsequent milestone)
**Confidence:** MEDIUM-HIGH (verified against npm, official docs, GitHub issues; some model sizes MEDIUM due to no direct WebLLM config.ts access)

---

## Scope

The existing extension stack (Rust/WASM, vanilla JS, MV3, DOMPurify 3.3.1) is frozen. This research
covers only the new additions required for v1.2:

1. Transformers.js — sentence encoder for semantic clustering
2. `Xenova/all-MiniLM-L6-v2` — ONNX model for 384-dim embeddings
3. `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` — replacement SLM in WebLLM
4. WebGPU availability detection and WASM fallback strategy
5. Bundler vs. no-bundler: how to vendor Transformers.js in MV3 without breaking CSP

---

## Recommended Stack

### New Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@huggingface/transformers` | 3.x (3.8.1 latest stable) | Sentence encoder pipeline — produce 384-dim embeddings from chat messages | Official HuggingFace library; ONNX Runtime Web backend runs in browser without server; supports `feature-extraction` pipeline with mean pooling; v3 adds WebGPU acceleration |
| `Xenova/all-MiniLM-L6-v2` (ONNX) | — (model, not versioned) | MiniLM sentence encoder model | Purpose-built for semantic similarity; 384-dim output; q8 quantized ONNX is ~23MB; widely used for in-browser clustering; Transformers.js ships it as a first-class example model |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | — (WebLLM model ID) | Replace Phi-2 in WebLLM; consent-gated SLM for chat summarization | Smaller download and VRAM than Phi-2; modern instruct-tuned model; reuses existing Qwen2-0.5B WASM in WebLLM (no new WASM compilation needed); well-supported in prebuiltAppConfig |

### No New Runtime Libraries Required

The GPU scheduler module, cosine similarity math, and pipeline orchestration are pure JS — no
additional library is needed beyond what Transformers.js provides.

---

## Technology Details

### 1. Transformers.js — Version and Package Name

**Package:** `@huggingface/transformers` (previously `@xenova/transformers` for v1/v2)
**Current stable:** 3.8.1 (published ~3 months ago as of Feb 2026)
**v4 status:** Preview/beta available on npm as of early 2026 — do NOT use for this milestone. v4 rewrites the WebGPU runtime in C++ and is experimental.

Use 3.x (3.8.1). It is stable, has proven Chrome extension usage patterns, and has official documentation.

```bash
npm install @huggingface/transformers@3
```

### 2. all-MiniLM-L6-v2 — Model ID, Size, Loading

**Transformers.js model ID:** `Xenova/all-MiniLM-L6-v2`

This is the ONNX-converted version hosted at huggingface.co/Xenova/all-MiniLM-L6-v2. The upstream
model is `sentence-transformers/all-MiniLM-L6-v2`.

**Model properties:**
- Embedding dimensions: 384
- Max input tokens: 256 (effective; do not feed entire message windows)
- ONNX quantized (q8 default for WASM backend): ~23MB download
- ONNX fp32 (unquantized): ~90MB

**Use the q8 quantized variant** — it is the Transformers.js default for WASM backend and is
adequate for clustering chat messages. Specify dtype explicitly:

```javascript
import { pipeline, env } from '@huggingface/transformers';

// Set WASM paths to local extension files before anything else
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');

const encoder = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  { dtype: 'q8' }   // ~23MB; default for WASM backend
);
```

**Caching:** Transformers.js uses the browser Cache API (via ONNX Runtime's built-in caching) to
store model weights after first download. On subsequent loads the model loads from cache without
re-downloading. No explicit IndexedDB or chrome.storage.local management needed. This is
transparent to the extension.

**Loading approach:** Load eagerly when the sidebar initializes, before any clustering is attempted.
The ~23MB download happens once and is cached. Because this is auto-loaded without a consent modal
(per project requirements), keep the download silent — show a spinner but no blocking prompt.

### 3. Qwen2.5-0.5B-Instruct — WebLLM Model ID, Size, API Changes

**WebLLM model ID:** `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`

This is the exact string to pass to `CreateMLCEngine()` in the existing `llm-adapter.js`.

**Size comparison:**

| Model | VRAM Required | Notes |
|-------|--------------|-------|
| `Phi-2-q4f16_1-MLC` (current) | ~1,570 MB | Phi-2 is a 2.7B param model; larger download (~1.57 GB repository) |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (new) | 944 MB | 0.5B params; download is significantly smaller |

Qwen2.5-0.5B requires approximately 40% less VRAM than Phi-2 and has a considerably smaller
download size. This is a meaningful improvement for users on integrated graphics or low-memory systems.

**WASM reuse note (MEDIUM confidence):** WebLLM source (GitHub issue #490) indicates that
Qwen2.5-0.5B can reuse the same compiled WASM library as Qwen2-0.5B since there is no
architectural change between versions, only weight changes. This means the model loads without
requiring a new WASM compilation step in WebLLM.

**API change in llm-adapter.js:** The change is a one-liner. The `CreateMLCEngine` call signature
is unchanged. Only the model ID string changes:

```javascript
// Before:
engine = await CreateMLCEngine('Phi-2-q4f16_1-MLC', { ... });

// After:
engine = await CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', { ... });
```

The `chat.completions.create()` API (OpenAI-compatible) is identical between models. Existing
prompt construction and response parsing in `llm-adapter.js` need no changes beyond the model ID.

**Disk space disclosure:** Update the consent modal text to reflect the new size (~400MB download,
~950MB VRAM requirement). The existing `navigator.storage.estimate()` gating logic continues
to work — just update the `MODEL_SIZE_BYTES` constant.

### 4. WebGPU Availability Detection and Fallback Strategy

**The two components use WebGPU differently:**

| Component | WebGPU? | WASM fallback? |
|-----------|---------|----------------|
| Transformers.js encoder (MiniLM) | Optional — faster if available | Yes, automatic; WASM is default |
| WebLLM SLM (Qwen) | Required — WebLLM does not support CPU inference | No; falls back to rule-based summarizer |

**Detection pattern:**

```javascript
const hasWebGPU = typeof navigator !== 'undefined' &&
                  'gpu' in navigator &&
                  (await navigator.gpu.requestAdapter()) !== null;
```

**For the encoder:** Let Transformers.js handle backend selection automatically. Default
(`dtype: 'q8'`) runs WASM. To explicitly prefer WebGPU when available:

```javascript
const encoder = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  {
    dtype: hasWebGPU ? 'fp32' : 'q8',
    device: hasWebGPU ? 'webgpu' : 'wasm'
  }
);
```

**For the GPU scheduler (new module):** The scheduler must serialize GPU access because
Transformers.js (ONNX Runtime WebGPU) and WebLLM both try to use the GPU adapter. They
cannot run simultaneously. The scheduler pattern:

1. Encoder is priority 1 (fast, ~50ms per batch, must run frequently)
2. SLM is priority 2 (slow, runs on demand, queued behind encoder)
3. Use a simple promise-based mutex — no npm library needed

**WASM backend note — service worker:** WebGPU is NOT available in Chrome extension service
workers (background.js). This is a confirmed limitation (Transformers.js GitHub issue #787,
ONNX Runtime GitHub issue #20876). Both Transformers.js and WebLLM must run in a page context
(sidebar.html), not in background.js. The existing architecture already does this correctly —
sidebar.js loads WASM and WebLLM directly in the side panel page, not in background.js.

**MV3 sidePanel context:** `navigator.gpu` is available in Chrome sidePanel pages (they are
rendered HTML pages with full Web API access, not service workers). WebGPU works in the
sidePanel context.

### 5. No-Bundler Constraint — Vendoring Transformers.js in MV3

This is the highest-complexity integration concern. Transformers.js tries to fetch ONNX
Runtime WASM helper files from a CDN at runtime. MV3 blocks remote fetches due to CSP
(`script-src 'self'`). The fetch fails silently or throws. This **must** be solved before
the encoder works.

**Solution: Manual vendor + wasmPaths override**

No bundler (Vite, webpack, esbuild) is required. The pattern uses npm for downloads only,
then manual file copying into `extension/libs/transformers/`. This matches how the project
already handles DOMPurify (vendored at `extension/libs/dompurify/purify.min.js`).

**Step 1: Install Transformers.js locally (dev dependency, not bundled)**

```bash
npm install --save-dev @huggingface/transformers@3
```

**Step 2: Copy files into extension**

```bash
# The core ESM bundle
cp node_modules/@huggingface/transformers/dist/transformers.js \
   extension/libs/transformers/transformers.js

# ONNX Runtime WASM files (the ones that get fetched from CDN at runtime)
# These filenames may change between patch versions — verify after upgrade
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs \
   extension/libs/transformers/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm \
   extension/libs/transformers/
# For WebGPU backend (optional):
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs \
   extension/libs/transformers/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm \
   extension/libs/transformers/
```

Add this to `scripts/build.sh` so the copy runs automatically after `wasm-pack build`.

**Step 3: Set wasmPaths before initializing Transformers.js**

In `encoder-adapter.js` (new module), before calling `pipeline()`:

```javascript
import { pipeline, env } from '../libs/transformers/transformers.js';

// Must be set before any pipeline() call
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');
```

**Step 4: Declare web_accessible_resources in manifest.json**

```json
"web_accessible_resources": [
  {
    "resources": [
      "libs/transformers/*.wasm",
      "libs/transformers/*.mjs"
    ],
    "matches": ["<all_urls>"]
  }
]
```

**Step 5: Update CSP if needed**

The current CSP is:
```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src ...
```

`wasm-unsafe-eval` is already present. The ONNX WASM backend requires this. No CSP changes
are needed if all WASM files are vendored locally.

If using WebGPU backend, no additional CSP is required — WebGPU is accessed via the GPU API,
not via script loading.

**Why not use CDN or import maps:** MV3 blocks all external script fetches. Using jsDelivr
CDN at runtime was a common suggestion for Manifest V2 but fails in MV3. A 2025 GitHub
issue (#1248) documents this exact failure mode.

---

## Installation

```bash
# Install as dev dependency (files will be manually vendored, not bundled)
npm install --save-dev @huggingface/transformers@3

# The existing WebLLM setup is unchanged — Qwen2.5-0.5B uses the same bundle
# (extension/libs/web-llm/index.js) — only the model ID string changes in llm-adapter.js

# Add file copy steps to scripts/build.sh (see step 2 above)
```

No new runtime npm packages are added to the extension. All new files are vendored into
`extension/libs/transformers/` following the same pattern as DOMPurify and WebLLM.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `Xenova/all-MiniLM-L6-v2` via Transformers.js | `sentence-transformers/all-MiniLM-L6-v2` (Python) | Python is not available in-browser; the Xenova repo is the official ONNX-converted version for Transformers.js |
| Transformers.js 3.x | Transformers.js 4.x (preview) | v4 is in preview/beta as of Feb 2026; uses a rewritten WebGPU runtime not yet stable for production extensions |
| `@huggingface/transformers` | `@xenova/transformers` (v2) | v2 is deprecated; v3+ uses the official HuggingFace org package name |
| Manual vendor + wasmPaths | Vite/webpack build step | Project has no bundler and no build pipeline for JS; adding a bundler is a significant architectural change that the project explicitly avoids |
| Manual vendor + wasmPaths | CDN import in ESM | Blocked by MV3 CSP; will throw at runtime |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 1.5B requires ~2GB VRAM; too heavy for integrated graphics; 0.5B meets the quality bar for short chat summarization |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | Qwen2.5-0.5B is smaller (0.5B vs 1B); Qwen2.5 has superior instruct-following at small sizes; context window (4096) is sufficient |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Transformers.js v4 (preview) | Beta-quality; WebGPU runtime rewritten in C++, not stable; API may change before release | `@huggingface/transformers@3` (3.8.1) |
| `@xenova/transformers` | Deprecated; v2 only; no longer receives updates | `@huggingface/transformers@3` |
| CDN import for Transformers.js at runtime | Blocked by MV3 CSP (`script-src 'self'`); fails silently or throws | Manual vendor into `extension/libs/transformers/` |
| Running Transformers.js or WebLLM in background.js | Service workers have no access to `navigator.gpu`; WebGPU and WASM both fail in service worker context | Run in sidebar.html page context only |
| `Qwen2.5-3B-Instruct` or larger | Exceeds ~2GB VRAM; most users with integrated graphics cannot run it; consent-gating is insufficient safety net | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` |
| Running encoder and SLM simultaneously | GPU adapter contention causes inference failures or hangs | GPU scheduler with priority queue (encoder priority 1, SLM priority 2) |
| DOMPurify for encoder output | Encoder output is a Float32Array (embeddings), not HTML; sanitization is inapplicable | Validate embedding dimensions only |

---

## Stack Patterns by Variant

**If WebGPU is available (navigator.gpu returns adapter):**
- Run encoder with `device: 'webgpu'`, `dtype: 'fp32'` — faster inference (~10ms vs ~50ms)
- Run WebLLM Qwen normally (always requires WebGPU)
- GPU scheduler enforces serialization: encoder first, SLM queued

**If WebGPU is NOT available:**
- Run encoder with `device: 'wasm'`, `dtype: 'q8'` — slower but works on any hardware
- WebLLM Qwen unavailable — fall back to rule-based summarizer (existing `createFallbackEngine()` in llm-adapter.js)
- WASM keyword clustering (existing Rust/WASM engine) continues as the clustering fallback

**If encoder fails to load (network error, cache miss):**
- Fall back to WASM keyword clustering
- Log error, do not surface to user on first attempt
- Retry on next analysis cycle

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| `@huggingface/transformers@3.8.1` | `onnxruntime-web@1.20.x` | Transformers.js 3.x pins its own onnxruntime-web version; use the version it brings in, not a separately installed one |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | WebLLM (existing `libs/web-llm/index.js`) | Confirm the bundled WebLLM version includes Qwen2.5-0.5B in its prebuiltAppConfig; if the bundled version is old, it may only know Phi-2. May require re-downloading the WebLLM bundle. |
| MV3 `wasm-unsafe-eval` CSP | All vendored WASM files | Already present in manifest.json; covers both existing WASM engine and new ONNX Runtime WASM |
| Chrome sidePanel + WebGPU | Chrome 113+ | sidePanel requires Chrome 114+; WebGPU in extension pages requires Chrome 113+; overlap is fine |

---

## CSP Update Required for HuggingFace Model Cache

The existing `connect-src` already includes `https://huggingface.co` and `https://cdn-lfs.huggingface.co`
for WebLLM. Transformers.js fetches model weights from the same HuggingFace CDN endpoints. No
CSP change is needed for model weight downloads.

However, if the bundled WebLLM version in `extension/libs/web-llm/` was compiled before Qwen2.5
was added to the prebuilt model list, it will not know the model's CDN URL. In that case the WebLLM
bundle must be re-downloaded (see WEBLLM_SETUP.md). The CSP does not need updating — just the
vendored bundle.

---

## Sources

- [@huggingface/transformers npm page](https://www.npmjs.com/package/@huggingface/transformers) — version 3.8.1 confirmed current stable (HIGH confidence)
- [Transformers.js v3 announcement](https://huggingface.co/blog/transformersjs-v3) — v3 feature set including WebGPU confirmed (HIGH confidence)
- [Transformers.js v4 Preview announcement](https://huggingface.co/blog/transformersjs-v4) — v4 is preview/beta, not production-ready (HIGH confidence)
- [Xenova/all-MiniLM-L6-v2 on HuggingFace](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — model ID confirmed, 384-dim embeddings confirmed (HIGH confidence)
- [Transformers.js browser extension tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/browser-extension) — official wasmPaths pattern for MV3 (HIGH confidence)
- [Transformers.js GitHub issue #1248](https://github.com/huggingface/transformers.js/issues/1248) — CDN fetch blocked in MV3 confirmed (HIGH confidence)
- [Transformers.js GitHub issue #787](https://github.com/xenova/transformers.js/issues/787) — WebGPU/WASM unavailable in service worker context confirmed (HIGH confidence)
- [Running Transformers.js in Chrome MV3 — Medium (Nov 2025)](https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac) — wasmPaths + web_accessible_resources pattern verified (MEDIUM confidence — community source, consistent with official docs)
- [Qwen2.5-0.5B-Instruct-q4f16_1-MLC model page](https://www.promptlayer.com/models/qwen25-05b-instruct-q4f161-mlc-feee) — 944 MB VRAM confirmed (MEDIUM confidence — secondary source; matches expected quantization math)
- [WebLLM GitHub issue #683 — model list](https://github.com/mlc-ai/web-llm/issues/683) — Qwen2.5-0.5B variants in prebuiltAppConfig confirmed; low_resource_required flag noted (MEDIUM confidence — issue tracker, not merged config.ts)
- [WebLLM GitHub issue #490 — Qwen2-0.5B WASM reuse](https://github.com/mlc-ai/web-llm/pull/490) — Qwen2.5-0.5B reuses Qwen2-0.5B WASM (MEDIUM confidence — PR, not final release notes)
- [mlc-ai/phi-2-q4f16_1-MLC on HuggingFace](https://huggingface.co/mlc-ai/phi-2-q4f16_1-MLC) — Phi-2 repository size 1.57 GB confirmed (HIGH confidence)
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu) — device and dtype options confirmed (HIGH confidence)
- [Chrome WebGPU documentation](https://developer.chrome.com/docs/web-platform/webgpu) — WebGPU available in extension pages (not service workers) confirmed (HIGH confidence)

---

*Stack research for: Semantic AI Pipeline (v1.2 milestone)*
*Researched: 2026-02-20*
