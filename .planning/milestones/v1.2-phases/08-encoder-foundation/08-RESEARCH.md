# Phase 8: Encoder Foundation - Research

**Researched:** 2026-02-20
**Domain:** Transformers.js 3.x / ONNX Runtime Web / Chrome MV3 extension vendoring
**Confidence:** MEDIUM-HIGH (core APIs verified via official docs; MV3 vendoring verified via official example repo; some edge cases remain LOW)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Loading experience**
- Progress bar with percentage at the top of the sidebar, inline (slim bar above cluster content)
- Same progress bar shown on every sidebar open, whether first download (~23MB) or cached initialization (~5-30s)
- Stage-aware text: "Downloading model..." -> "Initializing encoder..." -> "Warming up..." with percentage throughout
- Sidebar waits for encoder to finish loading before displaying any analysis results (no WASM-first in Phase 8)
- Progress bar silently dismisses when loading completes — fills to 100% and fades out, no "ready" confirmation

**Encoder status visibility**
- No visible encoder status indicator in Phase 8 — Phase 10 adds the Semantic/Keyword badge
- All encoder logs (load time, batch sizes, cache hits, backend selection) go to console.log only
- No debug panel in the sidebar

**Batch size strategy**
- Adaptive batching: smaller batches in slow chat, larger in fast chat
- Minimum batch size: 10 messages (matches requirement floor)
- Hard cap at 50 messages per batch (matches requirement ceiling)
- Time-based trigger: if fewer than 10 messages have accumulated after a timeout period, encode whatever is queued — prevents messages from going stale in slow chats

**Failure communication**
- On download failure: show "Download failed, retrying..." in the progress bar area, retry 2-3 times before giving up
- After retries exhausted: brief error message "Semantic engine unavailable — using keyword analysis" for a few seconds, then sidebar proceeds normally with WASM keyword clustering
- WebGPU/WASM backend switch is transparent to the user — no main sidebar indication
- GPU vs CPU encoding backend info shown in Settings page only, not in the main sidebar view

### Claude's Discretion

- Exact progress bar styling (color, height, animation)
- Time-based trigger timeout duration (e.g. 5s, 10s)
- Adaptive batch size curve between 10-50
- Retry delay strategy (immediate, exponential backoff)
- Progress bar fade-out animation timing
- Stage text wording refinements

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENC-01 | Transformers.js 3.x vendored into extension with ONNX WASM paths configured for MV3 CSP compliance | Vendoring pattern documented: copy dist files from npm package, set `env.backends.onnx.wasm.wasmPaths`, add `web_accessible_resources` |
| ENC-02 | all-MiniLM-L6-v2 encoder auto-loads on extension startup without user consent (~23MB, cached after first download) | Model is 23MB at int8/uint8 quantization; `progress_callback` API supports stage tracking; browser Cache API handles persistence |
| ENC-03 | Messages encoded in batches (10-50) into 384-dimensional vectors via Transformers.js feature-extraction pipeline | `pipeline('feature-extraction', model, { pooling: 'mean', normalize: true })` returns 384-dim tensors; `.tolist()` extracts float arrays |
| ENC-04 | WebGPU backend used for encoding when available, WASM backend as automatic fallback | Device selection is per-pipeline at init time; `device: 'webgpu'` with automatic WASM fallback when `navigator.gpu` unavailable |
| ENC-05 | Incremental encoding with message hash cache — only new messages re-encoded on each analysis cycle | Hash-based deduplication: fast hash per message text, Map for cache lookup; no new library needed |
</phase_requirements>

---

## Summary

Phase 8 integrates Transformers.js 3.x into the Chat Signal Radar sidebar to produce 384-dimensional embeddings from chat messages using the `all-MiniLM-L6-v2` model. The primary technical challenge is making this work within Chrome's Manifest V3 Content Security Policy, which blocks dynamic imports from CDNs that Transformers.js uses by default for ONNX WASM helper files.

The solution is well-established: vendor the Transformers.js dist bundle and its ONNX WASM companion files into `extension/libs/transformers/`, point `env.backends.onnx.wasm.wasmPaths` to those local files via `chrome.runtime.getURL()`, and declare everything in `web_accessible_resources`. This is the same pattern used by the official HuggingFace browser-extension example. The sidebar page context (not background service worker) is the correct execution environment — confirmed by existing project decision and by the known limitation that WebGPU is unavailable in MV3 service workers.

The `all-MiniLM-L6-v2` model at int8 quantization is ~23MB (matching the requirement), cached by the browser's Cache API after first download. The feature-extraction pipeline API is straightforward: `pipeline('feature-extraction', model, options)` then call with `{ pooling: 'mean', normalize: true }` to get unit-normalized 384-dim vectors. Progress events from `progress_callback` provide `status`, `progress`, `file`, `loaded`, and `total` fields needed to drive the stage-aware progress bar.

**Primary recommendation:** Vendor Transformers.js and ONNX WASM files into `extension/libs/transformers/` using a build script step, configure `env.backends.onnx.wasm.wasmPaths` before pipeline creation, and implement the encoder as a module (`encoder-adapter.js`) alongside the existing `llm-adapter.js` pattern.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@huggingface/transformers` | 3.x (latest: ~3.8.x) | Run ONNX models in browser; provides `pipeline()` API | Official HuggingFace library; replaces `@xenova/transformers`; v3 adds WebGPU support |
| `Xenova/all-MiniLM-L6-v2` | ONNX weights on HF Hub | 384-dim sentence encoder, ~23MB at int8 | Standard sentence embedding model; Xenova ONNX-converted weights are the canonical choice for Transformers.js |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ONNX Runtime Web (bundled in `@huggingface/transformers`) | Embedded | WebGPU + WASM backend for model inference | Automatic; no separate install needed |
| Browser Cache API (`caches`) | Web standard | Persists downloaded model across sidebar closes | Default behavior of Transformers.js `env.useBrowserCache = true` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Xenova/all-MiniLM-L6-v2` (int8, 23MB) | `model_quantized.onnx` (also 23MB) or `model_fp32.onnx` (90MB) | int8/uint8 variants are essentially the same size and accuracy for this task; fp32 is 4x larger with negligible accuracy gain for short chat messages |
| `env.backends.onnx.wasm.wasmPaths` pointing to vendored files | CDN delivery | CDN breaks MV3 CSP; vendoring is mandatory |
| `device: 'webgpu'` with manual fallback | `device: 'wasm'` always | Manual fallback requires duplicating init logic; Transformers.js does NOT auto-fallback from WebGPU to WASM — you must try WebGPU and catch, then init WASM |

**Installation:**
```bash
npm install @huggingface/transformers
```

---

## Architecture Patterns

### Recommended Project Structure

```
extension/
├── libs/
│   └── transformers/       # vendored Transformers.js + ONNX WASM files
│       ├── transformers.js  # main bundle (ES module)
│       ├── ort-wasm-simd-threaded.jsep.mjs
│       ├── ort-wasm-simd-threaded.jsep.wasm
│       ├── ort-wasm-simd-threaded.wasm
│       ├── ort-wasm-simd.wasm
│       └── ... (other ort-wasm-*.{wasm,mjs} files from npm dist)
├── sidebar/
│   ├── encoder-adapter.js  # NEW: encoder singleton, batch queue, hash cache
│   ├── sidebar.js          # existing: import from encoder-adapter.js
│   └── ...
└── manifest.json           # updated: web_accessible_resources, CSP (already has wasm-unsafe-eval)
```

### Pattern 1: Vendoring WASM Files via Build Script

**What:** Copy Transformers.js and its ONNX WASM companion files from `node_modules` into `extension/libs/transformers/` as part of the project build.
**When to use:** Required for MV3 CSP compliance. CDN fetches are blocked.
**Example build script addition:**
```bash
# In scripts/vendor-transformers.sh (or added to scripts/build.sh)

echo "Vendoring Transformers.js..."
TRANSFORMERS_DIST="node_modules/@huggingface/transformers/dist"
DEST="extension/libs/transformers"
mkdir -p "$DEST"

# Copy main bundle
cp "$TRANSFORMERS_DIST/transformers.js" "$DEST/"

# Copy ONNX WASM files (all ort-wasm-* files needed by ONNX Runtime Web)
cp "$TRANSFORMERS_DIST"/ort-wasm*.wasm "$DEST/"
cp "$TRANSFORMERS_DIST"/ort-wasm*.mjs "$DEST/" 2>/dev/null || true
```

**Note:** The exact list of `ort-wasm-*` files changes between Transformers.js releases. The safest approach is `cp dist/ort-wasm* $DEST/` to copy all of them. Confirm after installing which files exist in the dist folder.

### Pattern 2: env Configuration Before Pipeline Creation

**What:** Set `env.backends.onnx.wasm.wasmPaths` to the local extension URL before any pipeline is created. This must happen before any Transformers.js model loading.
**When to use:** Always, in any browser extension context.
**Example:**
```javascript
// Source: verified pattern from HF GitHub issue #1248 and community articles
import { env, pipeline } from '../libs/transformers/transformers.js';

// Point ONNX Runtime to local vendored WASM files
// Must be set BEFORE any pipeline() or model creation call
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');

// Allow remote model download (HuggingFace CDN for model weights)
// Model weights are fetched from HF CDN and cached by browser Cache API
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Do NOT set env.localModelPath — we want remote download with local caching
```

### Pattern 3: Encoder Singleton with Lazy Init and Progress Callback

**What:** Create encoder pipeline once, reuse across all encode calls. Initialize asynchronously with progress events driving the UI progress bar.
**When to use:** Always — pipeline creation is expensive (~5-30s). Never create per batch.
**Example:**
```javascript
// encoder-adapter.js
// Source: adapted from official HF React tutorial (progress_callback pattern)

import { env, pipeline } from '../libs/transformers/transformers.js';

// Configure WASM paths before any model loading
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');
env.allowRemoteModels = true;
env.useBrowserCache = true;

let encoderPipeline = null;
let encoderState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'

async function initEncoder(onProgress) {
  if (encoderState === 'ready') return encoderPipeline;
  if (encoderState === 'loading') throw new Error('Already loading');

  encoderState = 'loading';

  // Try WebGPU first, fall back to WASM
  // NOTE: Transformers.js does NOT auto-fallback — must be handled manually
  let device = 'wasm';
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    } catch (e) {
      console.log('[Encoder] WebGPU unavailable, using WASM');
    }
  }

  const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

  encoderPipeline = await pipeline(
    'feature-extraction',
    MODEL_ID,
    {
      device,
      dtype: 'q8',  // int8 quantized, ~23MB
      progress_callback: (event) => {
        // event.status: 'initiate' | 'download' | 'progress' | 'done' | 'ready'
        // event.progress: 0-100 (number)
        // event.file: filename being loaded
        // event.loaded, event.total: bytes
        if (onProgress) onProgress(event);
      }
    }
  );

  encoderState = 'ready';
  return encoderPipeline;
}

// Warm-up run to prime GPU/WASM JIT
async function warmUp() {
  await encoderPipeline(['warm up'], { pooling: 'mean', normalize: true });
}
```

### Pattern 4: Progress Event to Stage Text Mapping

**What:** Map Transformers.js progress_callback event status values to user-facing stage text.
**When to use:** For the inline progress bar required by locked decisions.
**Example:**
```javascript
// Source: verified from official HF React tutorial + GitHub issue #1401 observation
function progressEventToStageText(event) {
  switch (event.status) {
    case 'initiate':
      // File is about to start downloading
      return { text: 'Downloading model...', percent: 0 };
    case 'download':
      // File download started (may lack progress field)
      return { text: 'Downloading model...', percent: 0 };
    case 'progress':
      // event.progress is 0-100 (per-file)
      return { text: 'Downloading model...', percent: event.progress };
    case 'done':
      // One file finished; model may have multiple files
      return { text: 'Initializing encoder...', percent: 95 };
    case 'ready':
      // All files loaded, pipeline ready (before warm-up)
      return { text: 'Warming up...', percent: 99 };
    default:
      return null;
  }
}
```

**Caveat (LOW confidence):** GitHub issue #1401 (2024) notes that some progress events lack `status`, `name`, or `file` fields. Defensive coding (null checks) is necessary.

### Pattern 5: Incremental Encoding with Hash Cache

**What:** Compute a fast hash per message text, skip encoding for already-seen messages, store embeddings keyed by hash.
**When to use:** Every analysis cycle to avoid re-encoding messages from previous batches.
**Example:**
```javascript
// Message hash cache for incremental encoding
// Use a simple string hash (no library needed — short chat messages)
const embeddingCache = new Map(); // hash -> Float32Array (384 dims)

function simpleHash(str) {
  // djb2-style hash — fast, good enough for deduplication of chat messages
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit int
  }
  return hash.toString(36);
}

async function encodeMessages(messages) {
  const newMessages = messages.filter(m => !embeddingCache.has(simpleHash(m.text)));

  if (newMessages.length > 0) {
    const texts = newMessages.map(m => m.text);
    // Batch encode only new messages
    const output = await encoderPipeline(texts, { pooling: 'mean', normalize: true });
    const embeddings = output.tolist(); // [[384 floats], [384 floats], ...]

    newMessages.forEach((msg, i) => {
      embeddingCache.set(simpleHash(msg.text), embeddings[i]);
    });
  }

  // Return embeddings for ALL messages (cached + new)
  return messages.map(m => embeddingCache.get(simpleHash(m.text)));
}

// Cache eviction: keep cache bounded to avoid memory growth in long sessions
const MAX_CACHE_SIZE = 2000; // messages
function trimCache() {
  if (embeddingCache.size > MAX_CACHE_SIZE) {
    // Delete oldest entries (Map preserves insertion order)
    const toDelete = embeddingCache.size - MAX_CACHE_SIZE;
    let count = 0;
    for (const key of embeddingCache.keys()) {
      if (count++ >= toDelete) break;
      embeddingCache.delete(key);
    }
  }
}
```

### Pattern 6: Adaptive Batching

**What:** Queue incoming messages and flush based on count threshold or time timeout.
**When to use:** Required by locked decisions (min 10, max 50, time-based flush).
**Example:**
```javascript
// Adaptive batch scheduler
let encodingQueue = [];
let flushTimer = null;
const MIN_BATCH = 10;
const MAX_BATCH = 50;
const TIME_FLUSH_MS = 8000; // Claude's discretion: 8s timeout

function scheduleEncode(messages) {
  encodingQueue.push(...messages);

  // Flush if at max capacity
  if (encodingQueue.length >= MAX_BATCH) {
    flushQueue();
    return;
  }

  // Reset time-based flush timer
  if (flushTimer) clearTimeout(flushTimer);
  if (encodingQueue.length > 0) {
    flushTimer = setTimeout(() => flushQueue(), TIME_FLUSH_MS);
  }
}

function flushQueue() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (encodingQueue.length === 0) return;

  const batch = encodingQueue.splice(0, MAX_BATCH);
  encodeMessages(batch).then(embeddings => {
    // embeddings available for current analysis cycle
  });
}
```

### Pattern 7: manifest.json Updates

**What:** Add `web_accessible_resources` for the vendored files and confirm CSP.
**When to use:** Required for MV3 — extension pages can only load resources declared in `web_accessible_resources`.
**Example additions to manifest.json:**
```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "libs/transformers/transformers.js",
        "libs/transformers/*.wasm",
        "libs/transformers/*.mjs"
      ],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;"
  }
}
```

**Note:** The existing CSP already has `'wasm-unsafe-eval'` which is required. The existing `connect-src` allows HuggingFace CDN fetches for the model weights (model download works via fetch, which the CSP covers). No changes to CSP directives are needed — only `web_accessible_resources` needs adding.

### Anti-Patterns to Avoid

- **Creating pipeline per analysis cycle:** `pipeline()` is expensive (loads model, sets up ONNX session). Create once, call many times.
- **Loading Transformers.js from CDN URL:** MV3 CSP blocks `<script src="https://cdn.jsdelivr.net/...">` and dynamic imports from CDNs. Must vendor.
- **Running encoder in background.js service worker:** WebGPU is unavailable in MV3 service workers. Already decided: sidebar page context is correct.
- **Setting `device: 'webgpu'` without a fallback try/catch:** Transformers.js does NOT automatically fall back from WebGPU to WASM. If WebGPU init fails (device not available, driver issue), the pipeline will throw. Must catch and retry with `device: 'wasm'`.
- **Assuming `env.backends.onnx.wasm.wasmPaths = ''` (empty string) is sufficient:** This may work in some versions but the reliable pattern is the full extension URL via `chrome.runtime.getURL()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message embedding computation | Custom ML inference code | `pipeline('feature-extraction', ...)` from Transformers.js | Handles tokenization, ONNX model execution, pooling, normalization |
| ONNX model execution | Custom WASM binding | ONNX Runtime Web (bundled in Transformers.js) | WebGPU backend, SIMD WASM, threading — extremely complex to replicate |
| Model file caching | Custom IndexedDB storage | Browser Cache API via `env.useBrowserCache = true` | Transformers.js handles cache key management, partial download resumption |
| Model progress tracking | Custom download manager | `progress_callback` option in `pipeline()` | Provides per-file status events including bytes loaded/total |
| Cosine similarity (Phase 10) | Dot product loops | Embeddings are already L2-normalized — dot product equals cosine similarity | `normalize: true` in `extractor()` call produces unit vectors |

**Key insight:** Transformers.js with ONNX Runtime Web is a complete inference stack. The only custom code needed is: env configuration, UI wiring for progress events, message batching/caching, and the encoder-adapter module that wraps the pipeline singleton.

---

## Common Pitfalls

### Pitfall 1: ONNX WASM Files Not Listed in web_accessible_resources

**What goes wrong:** Extension fails to load with "Failed to fetch" or "No available backend" errors. The WASM runtime cannot load its helper `.mjs` or `.wasm` files because MV3 blocks them.
**Why it happens:** MV3 treats all extension files as unavailable to JavaScript unless explicitly declared in `web_accessible_resources`.
**How to avoid:** Add `libs/transformers/*.wasm` and `libs/transformers/*.mjs` to `web_accessible_resources` in manifest.json.
**Warning signs:** Console errors mentioning "Failed to fetch" for `.wasm` or `.jsep.mjs` files; "no available backend found" from ONNX Runtime.

### Pitfall 2: env.backends.onnx.wasm.wasmPaths Set After Pipeline Creation

**What goes wrong:** WASM paths are ignored; Transformers.js still tries CDN (which fails in MV3).
**Why it happens:** The ONNX Runtime Web backend initializes lazily on first pipeline creation; once initialized it caches the WASM paths.
**How to avoid:** Set `env.backends.onnx.wasm.wasmPaths` at module level, before any `pipeline()` call.
**Warning signs:** Same "Failed to fetch" errors as Pitfall 1, even with `web_accessible_resources` configured.

### Pitfall 3: WebGPU Silently Fails Without Fallback

**What goes wrong:** `pipeline('feature-extraction', model, { device: 'webgpu' })` throws when WebGPU is unavailable. If uncaught, the encoder never initializes. If caught naively, no fallback is attempted.
**Why it happens:** Transformers.js v3 does NOT implement automatic WebGPU → WASM fallback. The `device` option is taken literally.
**How to avoid:** Wrap WebGPU pipeline creation in try/catch. On failure, retry with `device: 'wasm'`.
**Warning signs:** Encoder initialization silently fails on machines without WebGPU (older GPUs, some VMs, users with GPU disabled in Chrome).

### Pitfall 4: Progress Callback Event Shape Inconsistency

**What goes wrong:** `event.progress` or `event.status` is undefined for some events, causing NaN in percentage display or null reference errors.
**Why it happens:** GitHub issue #1401 (2024) confirms some progress events lack the full set of fields. This occurs especially for the `'ready'` event.
**How to avoid:** Always null-check `event.status` and `event.progress` before using. Provide default values.
**Warning signs:** Progress bar shows NaN% or jumps unexpectedly.

### Pitfall 5: Model Cache Size Unbounded in Long Sessions

**What goes wrong:** The `embeddingCache` Map grows continuously during a long stream, eventually consuming significant memory (~384 floats × 4 bytes = ~1.5KB per message).
**Why it happens:** Chat streams can run for hours with tens of thousands of messages.
**How to avoid:** Implement cache eviction (LRU or FIFO). A cap of 2000 entries costs ~3MB — acceptable. Trim on each encode cycle.
**Warning signs:** Memory usage of sidebar page grows monotonically during long streams.

### Pitfall 6: Build Script WASM File List Goes Stale

**What goes wrong:** After upgrading `@huggingface/transformers`, new or renamed WASM files are not copied to the extension, causing backend init failures.
**Why it happens:** Transformers.js occasionally renames or adds WASM file variants between releases (e.g., adding `ort-wasm-simd-threaded.jsep.wasm` in newer ONNX Runtime versions).
**How to avoid:** Use a glob in the build script (`cp dist/ort-wasm* $DEST/`) rather than enumerating filenames. Document the file list as inherently version-dependent.
**Warning signs:** Failures only after package updates.

### Pitfall 7: Sidebar Blocks Rendering While Waiting for Encoder

**What goes wrong:** Locked decision says "sidebar waits for encoder before displaying analysis results." If encoder init takes 30s+ on a slow connection, the sidebar appears frozen.
**Why it happens:** Phase 8 does not display WASM-based results while encoder loads (locked decision). The progress bar is the only feedback.
**How to avoid:** Ensure the progress bar is rendered immediately on sidebar open, before encoder init starts. Never await encoder init on the main render path; let the progress bar communicate status.
**Warning signs:** Users see a blank/frozen sidebar during model download.

---

## Code Examples

Verified patterns from official sources:

### Feature Extraction Pipeline (384-dim embeddings)
```javascript
// Source: https://huggingface.co/docs/transformers.js/main/guides/webgpu (verified)
import { pipeline } from '@huggingface/transformers';

const extractor = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  {
    device: 'webgpu',  // or 'wasm'
    dtype: 'q8',       // int8 quantized, ~23MB
  }
);

// Encode a batch of messages
const messages = ['Hello chat!', 'Anyone else confused?', 'Great stream today'];
const output = await extractor(messages, { pooling: 'mean', normalize: true });
const embeddings = output.tolist(); // number[][], shape: [3, 384]
console.log(embeddings[0].length); // 384
```

### Progress Callback Full Pattern
```javascript
// Source: https://huggingface.co/docs/transformers.js/en/tutorials/react (verified)
// event object: { status, file, loaded, total, progress, name }
const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  progress_callback: (event) => {
    const status = event.status ?? 'unknown';
    const percent = event.progress ?? 0;
    const file = event.file ?? '';

    if (status === 'progress') {
      updateProgressBar(percent, `Downloading model... ${percent.toFixed(0)}%`);
    } else if (status === 'done') {
      updateProgressBar(95, 'Initializing encoder...');
    } else if (status === 'ready') {
      updateProgressBar(99, 'Warming up...');
    }
  }
});
```

### env Configuration for MV3
```javascript
// Source: verified pattern from HF issue #1248 + community articles (MEDIUM confidence)
// Must run before any pipeline() call
import { env } from '../libs/transformers/transformers.js';

env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');
env.allowRemoteModels = true;    // Allow downloading model weights from HF Hub
env.useBrowserCache = true;      // Cache downloaded model in browser Cache API
```

### manifest.json web_accessible_resources
```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "libs/transformers/transformers.js",
        "libs/transformers/*.wasm",
        "libs/transformers/*.mjs"
      ],
      "matches": ["<all_urls>"]
    },
    {
      "resources": ["wasm/wasm_engine_bg.wasm", "wasm/wasm_engine.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Note:** The existing manifest.json does not have a `web_accessible_resources` block. The WASM engine files currently load via `import()` using `chrome.runtime.getURL()` from within the sidebar page, which works because sidebar pages can access extension files. However, `web_accessible_resources` is needed for the Transformers.js ONNX files because they are fetched by the ONNX Runtime internals (not by extension code directly), and those internal fetches require the resources to be web-accessible.

### Retry Logic for Download Failures
```javascript
// Claude's discretion: exponential backoff with 3 attempts
async function initEncoderWithRetry(onProgress, onError) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      return await initEncoder(onProgress);
    } catch (error) {
      console.error(`[Encoder] Init attempt ${attempt} failed:`, error);

      if (attempt < MAX_RETRIES) {
        onError(`Download failed, retrying... (${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 1s, 2s
      } else {
        onError('Semantic engine unavailable — using keyword analysis');
        // Show error briefly, then clear and proceed with WASM-only mode
        setTimeout(() => clearError(), 4000);
        return null; // Caller checks for null to know encoder unavailable
      }
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@xenova/transformers` (npm package name) | `@huggingface/transformers` | Transformers.js v3 (Oct 2024) | Import path changes; `@xenova/transformers` is deprecated |
| `quantized: true/false` boolean | `dtype: 'q8'/'q4'/'fp16'/'fp32'` | Transformers.js v3 | Finer control over quantization format |
| WebGPU only available in main thread | WebGPU now available in sidebar pages (extension pages) | Chrome 2024 | Sidebar page context is correct for WebGPU |
| Manual ONNX Runtime Web setup | Bundled in `@huggingface/transformers` | Transformers.js v3 | No separate `onnxruntime-web` install needed |

**Deprecated/outdated:**
- `@xenova/transformers`: Superseded by `@huggingface/transformers`. The `Xenova/` model namespace on HuggingFace Hub still works for model IDs.
- `Transformers.js v2 quantized: true`: Now use `dtype: 'q8'` for equivalent behavior.

---

## Open Questions

1. **Exact WASM file list for current `@huggingface/transformers` version**
   - What we know: Files include `ort-wasm-simd-threaded.jsep.mjs`, `ort-wasm-simd-threaded.jsep.wasm`, and several `.wasm` variants
   - What's unclear: Exact filenames for the version installed (3.x) — varies by release
   - Recommendation: After `npm install @huggingface/transformers`, run `ls node_modules/@huggingface/transformers/dist/ort-wasm*` to get exact list. Use glob in build script.

2. **Whether `web_accessible_resources` with glob patterns works for WASM/MJS files**
   - What we know: MV3 supports glob patterns in `web_accessible_resources`; `*.wasm` should work
   - What's unclear: Whether ONNX Runtime internal `fetch()` calls for `.mjs` files are satisfied by `web_accessible_resources` or require a different mechanism
   - Recommendation: Test with full URL in `wasmPaths` and check Network tab in DevTools. If `.mjs` files still fail, may need to include them explicitly rather than via glob.

3. **`dtype: 'q8'` vs `dtype: 'quantized'` for `Xenova/all-MiniLM-L6-v2`**
   - What we know: The model has `model_quantized.onnx` and `model_int8.onnx` (both ~23MB); `dtype: 'q8'` maps to int8
   - What's unclear: Whether `Xenova/all-MiniLM-L6-v2` with `dtype: 'q8'` picks `model_int8.onnx` or `model_quantized.onnx`
   - Recommendation: Either works for this use case (~23MB); test to confirm download completes and embeddings are 384-dim.

4. **Progress bar aggregation for multi-file downloads**
   - What we know: `progress_callback` fires per-file; `all-MiniLM-L6-v2` downloads tokenizer config + model file
   - What's unclear: Whether per-file `progress` (0-100) or aggregate progress is more useful for UI
   - Recommendation: Use per-file progress as a proxy for overall progress since model ONNX file dominates download time. On `status === 'done'` for the model file, consider the download complete.

---

## Sources

### Primary (HIGH confidence)
- `https://huggingface.co/docs/transformers.js/en/api/env` — Complete `env` API reference with all configuration flags
- `https://huggingface.co/docs/transformers.js/main/guides/webgpu` — WebGPU guide with verified code examples
- `https://huggingface.co/docs/transformers.js/en/tutorials/react` — Official tutorial confirming `progress_callback` event shape (`status`, `file`, `progress`, `loaded`, `total`)
- `https://raw.githubusercontent.com/huggingface/transformers.js-examples/main/browser-extension/public/manifest.json` — Official HF browser extension example showing CSP: `"script-src 'self' 'wasm-unsafe-eval'"` is sufficient
- `https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx` — Confirmed model files: `model_int8.onnx` = 23MB, `model_quantized.onnx` = 23MB, `model.onnx` = 90.4MB
- `https://huggingface.co/blog/transformersjs-v3` — v3 release notes: `@huggingface/transformers` replaces `@xenova/transformers`; `dtype` replaces `quantized`; WebGPU device option

### Secondary (MEDIUM confidence)
- GitHub issue #1248 (`huggingface/transformers.js`) — Confirmed MV3 CSP problem with CDN fetches for `ort-wasm-simd-threaded.jsep.mjs`; solution is vendoring + `env.backends.onnx.wasm.wasmPaths`
- WebSearch verification of `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('...')` pattern from multiple community articles (2024-2025)
- Official HF browser extension example background.js — Confirmed model runs in background service worker context (differs from our sidebar-page approach, but confirms Transformers.js works in MV3 generally)

### Tertiary (LOW confidence)
- GitHub issue #1401 (`huggingface/transformers.js`, 2024) — Progress callback event fields sometimes missing; flagged as needing defensive coding
- Microsoft ONNX Runtime discussion #23063 — Unresolved reports of WASM backend failures in MV3; however this appears to be service worker context (not sidebar page context); sidebar pages have full DOM + WebGPU access

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official docs, verified npm package, model Hub files checked
- Architecture / vendoring pattern: MEDIUM-HIGH — official example repo confirms the pattern; exact file list requires post-install verification
- Progress callback API: MEDIUM — official tutorial shows shape; issue #1401 flags edge cases
- WebGPU fallback: MEDIUM — Transformers.js docs confirm no auto-fallback; manual try/catch pattern inferred from docs + community
- Hash cache / batch scheduling: HIGH — standard JavaScript patterns, no external verification needed

**Research date:** 2026-02-20
**Valid until:** 2026-04-20 (Transformers.js releases frequently; re-check `env.backends.onnx.wasm.wasmPaths` pattern if upgrading past 3.x major version)
