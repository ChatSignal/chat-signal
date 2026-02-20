# Pitfalls Research: Semantic AI Pipeline in Existing Chrome Extension

**Domain:** Adding Transformers.js (MiniLM encoder) + Qwen2.5-0.5B-Instruct SLM to an existing MV3 Chrome extension
**Researched:** 2026-02-20
**Confidence:** HIGH for CSP/bundling/WebGPU mechanics (verified against official docs and confirmed issues); MEDIUM for WebGPU contention behavior (behavior is specified but browser handling is partly implementation-defined); MEDIUM for model load time benchmarks (no sidePanel-specific published data)

*This file covers v1.2 Semantic AI Pipeline integration pitfalls. The prior PITFALLS.md (also in this directory) covers v1.1 CWS submission pitfalls and remains valid for that scope.*

---

## Critical Pitfalls

### Pitfall 1: Transformers.js Fetches ONNX WASM Files from CDN at Runtime — Blocked by MV3 CSP

**What goes wrong:**
`@huggingface/transformers` ships several ONNX Runtime WASM helper files (e.g., `ort-wasm-simd-threaded.jsep.mjs`, `ort-wasm-simd-threaded.wasm`) that it fetches dynamically from its CDN the first time a pipeline runs. MV3 extensions are prohibited from fetching and executing remote code. The fetch fails silently or throws a CSP/network error, and the encoder never initializes. The failure surfaces as a generic "Failed to fetch" or ONNX initialization error with no clear indication that the CSP is the cause.

This is confirmed as a known issue in the Transformers.js GitHub issue tracker (issue #1248) and affects v3 of the package in extensions. The extension already has `wasm-unsafe-eval` in its CSP (correct for WASM execution), but that does not help with runtime CDN fetches — those are blocked by the MV3 content policy against remote code, not by `wasm-unsafe-eval`.

**Why it happens:**
Developers test Transformers.js in a regular browser tab where CDN fetches succeed, then move the code to an extension context without realizing the fetch restriction applies. The library's auto-discovery of its own WASM helpers is invisible during web development.

**How to avoid:**
Three mandatory steps, all required together:

1. **Copy ONNX WASM helpers into the extension at build time.** The relevant files live in `node_modules/@huggingface/transformers/dist/`. The specific files needed depend on the execution backend (CPU WASM or WebGPU). Add a build step (even a shell `cp`) that copies them into `extension/libs/transformers/`.

2. **Set `env.backends.onnx.wasm.wasmPaths` before initializing any pipeline.** In the adapter module that loads Transformers.js, call:
   ```javascript
   import { env } from '@huggingface/transformers';
   env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('libs/transformers/');
   ```
   This must happen before the first `pipeline()` call, not after.

3. **Declare the copied files as `web_accessible_resources` in manifest.json.** Without this, the extension's own pages cannot load the WASM files via `chrome.runtime.getURL`:
   ```json
   "web_accessible_resources": [{
     "resources": ["libs/transformers/*.wasm", "libs/transformers/*.mjs"],
     "matches": ["<all_urls>"]
   }]
   ```

The extension currently has no `web_accessible_resources` block — this block must be added.

**Warning signs:**
- Encoder initialization fails with "Failed to fetch" or "ONNX runtime initialization failed."
- No network requests appear in DevTools to HuggingFace CDN but also no WASM files loaded locally.
- Error occurs during the first `pipeline('feature-extraction', ...)` call.

**Phase to address:** Phase 1 (Transformers.js integration and WASM path setup). This is a blocking prerequisite — nothing else works until the WASM paths are correctly configured.

---

### Pitfall 2: Two WebGPU Inference Contexts Running Simultaneously Causes GPU Hang or OOM

**What goes wrong:**
The extension loads two GPU-accelerated models: MiniLM via Transformers.js (ONNX Runtime WebGPU backend) and Qwen2.5 via WebLLM (MLC-compiled WebGPU). Chrome does not support multiple GPU adapters simultaneously — both models share the same `GPUDevice`. When both attempt inference at the same time, command buffers from both are submitted to the same GPU queue without coordination.

The result is one of three failure modes depending on timing:
- **GPU hang**: Both inference calls issue large compute dispatches simultaneously; the GPU queue stalls under load, causing one or both to timeout. Chrome's WebGPU implementation will report the device as "lost" (`GPUDeviceLostInfo`), crashing both models.
- **Out of memory**: MiniLM occupies ~25MB of GPU VRAM; Qwen at q4f16 occupies ~250-400MB. Combined with Chrome's GPU process overhead and the sidePanel renderer, integrated GPU systems (common in laptops) can hit their VRAM ceiling, triggering `GPUOutOfMemoryError`. This has been observed in WebLLM issues (issue #517).
- **Correctness corruption**: In rare cases, interleaved compute dispatches from two separate `GPUCommandEncoder` instances can produce incorrect inference results without an obvious error.

**Why it happens:**
Developers initialize both models on startup and call them in response to different events (encoder on each analysis tick, SLM on user-triggered summary), assuming they are independent. They are not independent — they share the GPU queue.

**How to avoid:**
Build a GPU scheduler module (already planned in PROJECT.md) that serializes all GPU inference. Implementation pattern:

```javascript
// gpu-scheduler.js
const queue = [];
let running = false;

async function enqueue(task, priority) {
  return new Promise((resolve, reject) => {
    queue.push({ task, priority, resolve, reject });
    queue.sort((a, b) => a.priority - b.priority); // lower number = higher priority
    if (!running) drain();
  });
}

async function drain() {
  running = true;
  while (queue.length > 0) {
    const { task, resolve, reject } = queue.shift();
    try { resolve(await task()); }
    catch (e) { reject(e); }
  }
  running = false;
}
```

Call `enqueue(encoderTask, 1)` for MiniLM (priority 1) and `enqueue(slmTask, 2)` for Qwen (priority 2). The encoder gets the GPU first; the SLM waits.

**Warning signs:**
- `GPUDeviceLostInfo` error in the console.
- `GPUOutOfMemoryError` thrown from either model.
- One model works reliably alone but fails when the other is also active.
- GPU utilization jumps to 100% on extension open and stays there.

**Phase to address:** Phase 2 (GPU scheduler module). Must be built before integrating the SLM — do not run both models without coordination even in development. Test the scheduler in isolation before attaching real inference.

---

### Pitfall 3: Switching Phi-2 to Qwen2.5 Requires Chat Template Changes — Existing Prompts Will Hallucinate or Fail

**What goes wrong:**
Phi-2 uses a QA/code-completion prompt format (`Instruct: ... Output: ...`). Qwen2.5-Instruct uses ChatML format with special tokens:
```
<|im_start|>system
You are a helpful assistant.<|im_end|>
<|im_start|>user
...your prompt...<|im_end|>
<|im_start|>assistant
```

WebLLM handles chat template application automatically when you call `engine.chat.completions.create({ messages: [...] })` — it applies the correct template for the loaded model. However, the existing `llm-adapter.js` calls `engine.chat.completions.create` with hardcoded `system` and `user` message roles, which is correct for the API.

The risk is not in the API call structure but in the **prompt content**. The existing prompts in `buildSummaryPrompt()` and `analyzeSentiment()` were tuned for Phi-2's behavior: terse, instruction-following, code-adjacent. Qwen2.5-0.5B-Instruct at 0.5B parameters is substantially smaller and less capable than Phi-2-q4f16 in instruction-following fidelity. The structured response format expected by `parseSentimentResponse()` (`MOOD: [mood]\nCONFIDENCE: [value]\nREASON: [text]`) depends on the model reliably following format instructions — Qwen2.5-0.5B frequently outputs conversational preamble before the structured response, breaking the regex-style parser.

The model ID must also be changed. Phi-2 in WebLLM is `"Phi-2-q4f16_1-MLC"`. Qwen2.5-0.5B-Instruct is available as `"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"` or `"Qwen2.5-0.5B-Instruct-q0f32-MLC"` (q0f32 is fp32, larger but more accurate; q4f16_1 is quantized). The `appConfig.useIndexedDBCache` option used in the current code may be an older API — the current WebLLM API uses `useIndexedDB` inside the engine config, not `useIndexedDBCache`.

**Why it happens:**
Developers change the model ID string and expect the rest to work identically. The structured output expectations are model-specific and not surfaced until runtime testing.

**How to avoid:**
1. Change the model ID in `llm-adapter.js` to `"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"`.
2. Test `parseSentimentResponse()` with actual Qwen2.5-0.5B output. If the model prepends explanatory text before the `MOOD:` line, update the parser to scan for the first occurrence of `MOOD:` rather than expecting it on line 1.
3. Reduce prompt verbosity for the 0.5B model — shorter, simpler prompts improve format adherence at small parameter counts. Remove multi-paragraph prompts; use bullet lists.
4. Add a `max_tokens` limit tight enough to prevent run-on outputs (current: 60 for sentiment, 150 for summary — keep sentiment at 60, may need to reduce summary to 100).
5. Update the WebLLM config call to match the current API. Check `webllm.mlc.ai/docs/user/api_reference.html` for the current `CreateMLCEngine` signature before assuming `appConfig.useIndexedDBCache` is still valid.

**Warning signs:**
- `parseSentimentResponse()` returns `mood: 'neutral'` for every input because the parser finds no valid `MOOD:` line.
- Summary outputs contain conversational openers like "Sure! Here is my analysis..." before the content.
- Model loading fails with an unrecognized model ID error.
- Console warnings about deprecated API parameters in WebLLM.

**Phase to address:** Phase 3 (Qwen2.5 SLM integration). Treat prompt re-tuning as a first-class task, not a post-integration polish item.

---

### Pitfall 4: Transformers.js and WebLLM Cache in Different Stores — Neither Warns if the Other Evicts

**What goes wrong:**
Transformers.js caches model files (MiniLM ONNX weights, ~25MB) using the browser Cache API by default, keyed under the HuggingFace model name. WebLLM caches Qwen model shards in IndexedDB (with `useIndexedDBCache: true` in the current `llm-adapter.js` config) or the Cache API (default). Both caches use the **same origin** (`chrome-extension://[extension-id]`).

Three storage conflict scenarios:

1. **Cache eviction under storage pressure**: Chrome may evict `Cache API` or `IndexedDB` entries from the extension origin under system storage pressure. If Qwen's ~400MB shards are evicted, the next model load triggers a full re-download from HuggingFace CDN (blocked if the user is on a metered connection or has no internet). If MiniLM's 25MB ONNX cache is evicted, MiniLM re-downloads silently on next open — less painful but still adds cold-start latency.

2. **Cache namespace collision**: If both libraries happen to cache an artifact under the same Cache API key (unlikely but possible if model names collide), one overwrites the other. Transformers.js v3 keys caches by `HF_HUB_URL + model_id + filename`; WebLLM uses its own scheme. No collision expected, but not verified against a shared origin with both active.

3. **`useIndexedDB: true` and OPFS conflict**: If WebLLM is configured to use the Origin Private File System (OPFS) instead of IndexedDB (newer WebLLM default in some versions), it competes for the same OPFS quota as any future use of OPFS by Transformers.js. Current code uses `useIndexedDBCache: true` which avoids OPFS, but upgrading WebLLM version may silently change the default storage backend.

**Why it happens:**
Developers test each model in isolation. Cache eviction only surfaces under storage pressure (not during development on laptops with ample disk space).

**How to avoid:**
1. Keep the extension's `unlimitedStorage` permission (already in manifest v1.1) — this prevents both caches from being evicted by Chrome's storage pressure algorithm.
2. Pin Transformers.js to a specific version in whatever pseudo-package strategy is used (vendored or npm-built). Do not upgrade without checking the release notes for storage backend changes.
3. Audit the WebLLM version in `libs/web-llm/` when upgrading: confirm whether `useIndexedDBCache` is still the correct option name or whether it has moved. If the option name changed silently, WebLLM will fall back to the Cache API default, potentially competing with Transformers.js's Cache API usage.
4. Log which storage backend each library uses on initialization so post-incident debugging is possible.

**Warning signs:**
- MiniLM or Qwen model re-downloads on what should be a warm start (check network tab for HuggingFace CDN fetches on extension open).
- Storage quota errors (`QuotaExceededError`) in the console.
- Model loading succeeds once, fails next session, and succeeds again after clearing extension data.

**Phase to address:** Phase 1 (Transformers.js integration) — set the WASM path and verify MiniLM caches correctly; Phase 3 (SLM integration) — verify Qwen caches correctly and that both coexist. Test cache coexistence explicitly before shipping.

---

### Pitfall 5: Transformers.js Cannot Run in a Service Worker Context — Must Stay in the sidePanel Page

**What goes wrong:**
WebGPU is unavailable in Chrome extension service workers (the `background.js` context). This is a confirmed limitation tracked in Transformers.js issue #787. If the MiniLM encoder is initialized in the background service worker to allow it to persist across sidePanel closes, it will fail silently with no WebGPU backend available, fall back to a slower WASM backend, and produce different (potentially worse) embeddings.

The same limitation applies to WebLLM — the Qwen SLM also requires WebGPU and cannot run in the service worker.

**Why it happens:**
Developers move inference to the background worker to avoid re-loading models when the sidePanel closes, which is a reasonable architectural goal. The move breaks GPU access.

**How to avoid:**
Keep both models in the sidePanel page context (`sidebar.js`). Accept the consequence: when the user closes and reopens the sidePanel, models reload from cache (warm start from Cache API/IndexedDB). For MiniLM at ~25MB warm cache load time is acceptable (seconds, not minutes). For Qwen at ~400MB, the warm reload may take 5-15 seconds depending on hardware — show a loading indicator.

If persistence between sidePanel opens is critical, the alternative is an offscreen document (`chrome.offscreen.createDocument`) which supports WebGPU. This is significantly more complex to implement and is out of scope for v1.2 unless the reload latency proves unacceptable.

**Warning signs:**
- Encoder initialized in `background.js` fails with "WebGPU is not supported" or falls back to CPU.
- Different embedding vectors produced for identical input across sessions (indicates backend inconsistency).
- The console in the service worker context shows WASM backend selected instead of WebGPU.

**Phase to address:** Phase 1 (Transformers.js integration) — confirm the encoder runs in the sidePanel context, not the background. Document this constraint in an architecture decision record so future phases do not attempt to move inference to the background.

---

### Pitfall 6: MiniLM Auto-Loads Without Consent — Cold Start Blocks First Useful Render

**What goes wrong:**
The v1.2 design loads MiniLM automatically on extension open (no consent required, unlike Qwen). On the first open after extension install or cache clear, MiniLM must download ~25MB of ONNX weights. Until the download completes, semantic clustering is unavailable. The extension falls back to the WASM keyword-based engine during this time — which is correct behavior. The pitfall is **UI deadlock**: if the code `await`s the encoder initialization before rendering anything, the sidePanel shows a blank screen or perpetual spinner for the duration of the download.

Additionally, if the MiniLM initialization throws (CSP failure, CDN unreachable, insufficient storage), and there is no try/catch boundary around it, the unhandled rejection propagates and prevents the existing WASM engine from running at all. The fallback becomes unreachable.

**Why it happens:**
Developers initialize the encoder at the top of the module with `await pipeline(...)`, blocking the rest of initialization. Or they place it in the same `try` block as WASM initialization without a separate error boundary.

**How to avoid:**
Initialize MiniLM asynchronously and independently of the WASM engine:

```javascript
// Start WASM immediately (no await needed, it's synchronous after fetch)
const wasmModule = await loadWasm(); // existing code

// Start MiniLM in the background — do not await before rendering
initializeEncoder().catch(err => {
  console.warn('[Encoder] MiniLM unavailable, using WASM fallback:', err);
  encoderState = 'failed'; // UI reads this to show degraded mode indicator
});

// Render immediately using WASM — encoder upgrades it when ready
renderWithWasm(wasmModule);
```

Use a state flag (`encoderState: 'loading' | 'ready' | 'failed'`) that the UI reads. When `'ready'`, switch clustering to semantic. When `'failed'`, stay on WASM quietly.

**Warning signs:**
- sidePanel shows blank for 10+ seconds on first open.
- Encoder failure (CSP error) propagates to break WASM clustering.
- No visible difference in UI between encoder loading and encoder failed states.

**Phase to address:** Phase 1 (Transformers.js integration). The state machine for encoder lifecycle must be designed before writing any encoder initialization code, not added as an afterthought.

---

### Pitfall 7: No-Bundler Constraint Makes Transformers.js Import Non-Trivial

**What goes wrong:**
Transformers.js v3 is distributed as an ES module package (`@huggingface/transformers`). Without a bundler, you cannot use `import { pipeline } from '@huggingface/transformers'` in a Chrome extension — there is no `node_modules` resolution at runtime. The three options for a no-bundler extension are:

1. **ESM CDN import** (`import { pipeline } from 'https://cdn.jsdelivr.net/...'`) — blocked by MV3 CSP (remote code).
2. **Vendored single-file ESM build** — the `@huggingface/transformers` npm package does not ship a pre-built single-file ESM bundle. You must build one yourself using a bundler (esbuild, rollup) as a one-time build step, then vendor the output file. This is the recommended path.
3. **WebWorker with importScripts** — `importScripts` is not available in ES module workers (which MV3 background workers use). Sidebar scripts can use `importScripts` in a classic worker, but sidePanel pages use ES modules.

The viable approach is a one-time build step: use esbuild or rollup to produce `extension/libs/transformers/transformers.bundle.esm.js` from the npm package, then import that local file. This is consistent with how WebLLM is currently vendored at `extension/libs/web-llm/index.js`. The WASM helper files must be extracted separately and placed alongside (see Pitfall 1).

**Why it happens:**
The project description says "no bundler," which developers interpret as "no build step ever." The intent is "no bundler for the extension runtime code" — a one-time packaging step to vendor a library is not the same as a continuous bundler watching source files.

**How to avoid:**
Add a documented one-time vendor step to `scripts/build.sh` or a separate `scripts/vendor-transformers.sh`:
```bash
# One-time vendor step (re-run on Transformers.js version upgrade)
npx esbuild node_modules/@huggingface/transformers/src/transformers.js \
  --bundle --format=esm --platform=browser \
  --external:onnxruntime-node \
  --outfile=extension/libs/transformers/transformers.bundle.esm.js
# Then copy WASM files:
cp node_modules/@huggingface/transformers/dist/*.wasm extension/libs/transformers/
cp node_modules/@huggingface/transformers/dist/*.mjs extension/libs/transformers/
```

Import in the encoder adapter:
```javascript
import { pipeline, env } from chrome.runtime.getURL('libs/transformers/transformers.bundle.esm.js');
```

Note: dynamic `import()` with a `chrome.runtime.getURL` path works in sidePanel ES module context.

**Warning signs:**
- Import fails with "Cannot resolve '@huggingface/transformers'" or module not found.
- Attempt to use CDN import throws CSP error.
- WASM files load but the JS module itself is not found.

**Phase to address:** Phase 1 (Transformers.js integration). Resolve the import strategy before writing any encoder code. Do not assume CDN import will work.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during v1.2 but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode model IDs as strings (e.g., `"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"`) | No config overhead | Breaking change when WebLLM upgrades model naming scheme | Acceptable in MVP; extract to a constants file in a follow-up |
| Skip GPU scheduler; run encoder and SLM sequentially by convention | Simpler initial code | Race condition emerges when analysis tick and user-triggered summary overlap; GPU hang | Never — scheduler is required before both models are active |
| Use `DEFAULT_SETTINGS` copy in encoder adapter instead of shared constants | Faster to write | Fourth copy of DEFAULT_SETTINGS; settings drift between files | Acceptable if acknowledged as debt — existing three copies are acknowledged in PROJECT.md |
| Download MiniLM from HuggingFace CDN at runtime (no local cache pre-population) | No build step needed | 25MB download on cold start; fails on offline/metered connections | Acceptable if fallback to WASM is solid and failure is silent to the user |
| Embed Transformers.js bundle without version pinning | No extra tooling | Silent breaking change on re-vendor; future developers do not know which version is installed | Never — pin the version in a comment in the vendor script and in `package.json` devDependencies |

---

## Integration Gotchas

Common mistakes when connecting these specific libraries to this specific extension.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Transformers.js WASM paths | Call `env.backends.onnx.wasm.wasmPaths` after `pipeline()` is called | Set `wasmPaths` **before** any `pipeline()` call — it has no effect once ONNX Runtime is initialized |
| WebLLM model ID | Use `"Phi-2-q4f16_1-MLC"` string unchanged (copy-paste from existing code) | Change to `"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"` — the old ID will fail to resolve or load the wrong model |
| WebLLM `appConfig` API | Pass `appConfig: { useIndexedDBCache: true }` to `CreateMLCEngine` | Verify this option name against the WebLLM version vendored in `libs/web-llm/`; it may have changed to `useIndexedDB` |
| Cosine similarity on raw ONNX output | Use raw `last_hidden_state` tensor as embedding | MiniLM requires mean pooling + L2 normalization on `last_hidden_state` to produce sentence embeddings; raw output is per-token, not per-sentence |
| GPU scheduler and streaming | Stream Qwen token output while scheduler is locked | Streaming output holds the GPU lock for the entire generation duration — scheduler must treat the full streaming call as one atomic task, releasing only on stream completion |
| Encoder-to-SLM prompt pipeline | Pass raw cluster objects into Qwen prompt | Format semantic clusters as readable text before passing — Qwen2.5-0.5B performs better with human-readable cluster summaries than raw JSON arrays |

---

## Performance Traps

Patterns that work during development but degrade under real stream conditions.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running encoder on every message as it arrives | Analysis tick runs at 10-50 msg/sec in busy streams; each encoder call blocks GPU for ~5-50ms | Batch messages and run encoder on the analysis window (e.g., last 500 messages) on a timer tick, not per-message | Streams with >10 messages/sec |
| Encoder warm start assumption | Developer tests with model cached; ship to user with cold start; 25MB download stalls sidePanel | Explicitly test with cache cleared before each release | Every first open after install/update |
| Qwen max_tokens too large for real-time use | Summary generation takes 10-30s, blocking GPU for SLM duration, starving encoder queue | Keep `max_tokens` at ≤150 for summaries; Qwen2.5-0.5B generates ~5-10 tok/s on integrated GPU | Streams where user triggers summary frequently |
| Storing embeddings in memory for all 500+ messages in window | 500 messages × 384-dim float32 embeddings = ~768KB per window; if stored without cleanup, accumulates across analysis cycles | Store only the current window's embeddings; discard on window slide | After ~10 analysis cycles without cleanup |
| No timeout on encoder inference | ONNX Runtime occasionally hangs on first GPU initialization; extension appears frozen | Wrap encoder calls in `Promise.race([encoderCall, timeout(10000)])` with fallback to WASM | First GPU init on slow hardware |

---

## Security Mistakes

Integration-specific security issues relevant to adding an AI pipeline.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing raw chat messages directly into SLM prompt without length limits | Adversarial stream participants post crafted messages to manipulate Qwen2.5 output (prompt injection via chat); extreme-length messages cause context overflow | Truncate each message to 200 characters before including in SLM prompt; limit sample count per bucket (current: 2 samples per bucket — maintain this) |
| Including Qwen's raw JSON response in DOM | If Qwen hallucinates HTML/script tags, bypasses DOMPurify | Always pass LLM output through `DOMPurify.sanitize()` via the existing `safeSetHTML` helper before rendering |
| Fetching Transformers.js bundle from CDN (for "easy updates") | Executes remote code; violates MV3 CSP; also a supply-chain risk | Vendor the bundle locally; accept that updates require a deliberate re-vendor step |
| Not validating cosine similarity output range | Similarity outside [-1, 1] indicates normalization bug; clustering assigns all messages to wrong buckets silently | Assert similarity values are in [0, 1] (for normalized embeddings) before using them for cluster assignment; log a warning if not |

---

## UX Pitfalls

User experience mistakes specific to loading two large AI models in a sidebar.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state while MiniLM downloads/initializes | Extension appears broken (clusters missing, no explanation) | Show "AI clustering: loading..." indicator in the cluster section during encoder init; switch to "AI powered" badge on ready |
| Blocking sidePanel open on Qwen load | User clicks icon, waits 10-30s for the sidebar to respond | Render WASM-backed results immediately; Qwen loads in background after consent; show progress bar |
| Silent fallback from semantic to WASM clustering | User cannot tell if they have the better clustering or the keyword fallback | Show a small status badge: "Semantic" (green) vs "Keyword" (grey) so users understand which mode is active |
| Replacing all Phi-2 summaries immediately with Qwen | User loses existing summaries if Qwen performs worse | A/B test the new model internally before shipping; keep fallback chain (Qwen → rule-based) identical to existing (Phi-2 → rule-based) |
| GPU scheduler queue growing unboundedly | If analysis ticks fire faster than GPU can process, queue grows; latency compounds until extension lags seconds behind real-time | Cap the scheduler queue at a fixed depth (e.g., 3 tasks); drop oldest tasks when queue is full, prioritizing freshness over completeness |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces for the semantic pipeline.

- [ ] **MiniLM initialized**: `pipeline('feature-extraction', ...)` returns a function does not mean embeddings are correct — verify with a known sentence pair (cosine similarity of "What is this?" and "How does this work?" should be ~0.85, not 0 or 1).
- [ ] **WASM paths configured**: Encoder loads in a normal web page test does not mean it loads in the extension — test specifically in the sidePanel with DevTools attached.
- [ ] **GPU scheduler blocking**: Scheduler code exists does not mean it actually prevents concurrent GPU calls — verify by logging timestamps and confirming encoder and SLM never overlap.
- [ ] **Qwen model ID valid**: Model ID string compiles does not mean the model exists in WebLLM's model list — check the WebLLM supported models list at `webllm.mlc.ai/docs` for the exact ID string.
- [ ] **Mean pooling implemented**: Feature extraction pipeline returns output does not mean it returns sentence-level embeddings — verify the pooling step is applied before cosine similarity.
- [ ] **Fallback path tested**: WASM fallback "exists" does not mean it activates correctly when encoder fails — deliberately throw from encoder init and confirm WASM clustering renders normally.
- [ ] **Cache coexistence verified**: Both models cache correctly in isolation does not mean they coexist — test with both models initialized, then reload the sidePanel and verify neither re-downloads.
- [ ] **Prompt format correct for Qwen**: Chat completions return text does not mean the text is well-formed for the parser — log 20 raw Qwen outputs and confirm `MOOD:` and `CONFIDENCE:` appear consistently.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WASM path misconfiguration (encoder never initializes) | LOW | Set `env.backends.onnx.wasm.wasmPaths` before any `pipeline()` call; add `web_accessible_resources` entry; reload extension |
| GPU hang (device lost) | MEDIUM | Catch `GPUDeviceLostInfo`; destroy and re-request GPU device; reload both models from cache; show user-facing "restarting AI" message |
| Qwen output parser breaking (wrong format) | LOW | Add a fallback regex that scans for the first valid mood keyword anywhere in the response; revert to rule-based sentiment if no keyword found |
| MiniLM cold start blocking render | LOW | Move encoder init to background async call; render WASM results immediately; encoder upgrades results when ready |
| Model ID rejected by WebLLM | LOW | Check `webllm.mlc.ai/docs` for current supported model list; update ID string; reload extension |
| Cache eviction (model re-downloads unexpectedly) | MEDIUM | Confirm `unlimitedStorage` is in manifest; audit WebLLM config to ensure correct cache backend is selected; add startup check that logs cache hit/miss |
| Transformers.js + WebLLM cache collision | MEDIUM | Inspect Chrome's Application tab (Cache Storage and IndexedDB) in extension context; clear specific keys; rebuild vendor bundle and re-test |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ONNX WASM files blocked by CSP (Pitfall 1) | Phase 1: Transformers.js integration | `env.backends.onnx.wasm.wasmPaths` set; `web_accessible_resources` in manifest; encoder runs in sidePanel without network fetch |
| No-bundler import strategy (Pitfall 7) | Phase 1: Transformers.js integration | One-time esbuild vendor step documented; bundle file exists locally; no CDN imports in code |
| Encoder lifecycle state machine (Pitfall 6) | Phase 1: Transformers.js integration | sidePanel renders WASM results while encoder loads; encoder failure does not break WASM |
| Encoder context constraint — service worker not viable (Pitfall 5) | Phase 1: Transformers.js integration | Architecture decision recorded; encoder initialized only in sidebar.js |
| GPU scheduler preventing concurrent GPU calls (Pitfall 2) | Phase 2: GPU scheduler module | Timestamp logging confirms no overlap between encoder and SLM GPU calls |
| Cache coexistence between Transformers.js and WebLLM (Pitfall 4) | Phase 1 + Phase 3 | Both models warm-start correctly after cold-start test; no re-download on reopen |
| Qwen prompt format and parser tuning (Pitfall 3) | Phase 3: Qwen2.5 SLM integration | 20 raw Qwen outputs logged and validated; parser handles preamble; mood detection accuracy ≥ rule-based baseline |
| Prompt injection from chat messages into SLM | Phase 3: Qwen2.5 SLM integration | Message truncation at 200 chars verified; SLM output passed through `safeSetHTML` |
| Cold start UX blocking render (Pitfall 6) | Phase 1: Transformers.js integration | Manual test: clear extension cache, open sidePanel, confirm WASM results appear within 3s before encoder ready |

---

## Sources

- [Transformers.js Issue #1248 — Chrome extension fails to execute remote code from CDN](https://github.com/huggingface/transformers.js/issues/1248) — confirmed CDN fetch blocking in MV3
- [Transformers.js Issue #787 — WebGPU and WASM backends unavailable in Service Worker](https://github.com/xenova/transformers.js/issues/787) — confirmed service worker limitation
- [Running Transformers.js inside a Chrome extension (MV3) — Medium](https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac) — WASM path configuration pattern
- [Transformers.js + ONNX Runtime WebGPU in Chrome extension — Medium](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9) — `web_accessible_resources` pattern for WASM files
- [WebLLM Issue #517 — Device lost during reload due to insufficient memory](https://github.com/mlc-ai/web-llm/issues/517) — GPU OOM behavior confirmed
- [WebLLM Issue #374 — IndexedDB cache fails](https://github.com/mlc-ai/web-llm/issues/374) — cache reliability issues
- [WebLLM API Reference](https://webllm.mlc.ai/docs/user/api_reference.html) — `resetChat`, `reload`, `CreateMLCEngine` current API
- [WebLLM Supported Models](https://webllm.mlc.ai/docs/) — model ID strings including `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- [HuggingFace — mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q0f32-MLC) — Qwen2.5-0.5B available in MLC format
- [Chrome for Developers — Cache models in the browser](https://developer.chrome.com/docs/ai/cache-models) — Cache API preferred over IndexedDB for large models
- [GPUOutOfMemoryError — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUOutOfMemoryError) — OOM error type
- [Manifest — Content Security Policy | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — `wasm-unsafe-eval` is approved; remote code fetch is not
- [WebGPU Concurrency Guide — SitePoint](https://www.sitepoint.com/the-webgpu-concurrency-guide-mastering-async-compute-shaders/) — GPU queue serialization behavior
- [Qwen2.5 Chat Template — Qwen docs](https://qwen.readthedocs.io/en/v2.5/inference/chat.html) — `<|im_start|>` / `<|im_end|>` format confirmed
- [Phi-2 Prompt Formats — Prompting Guide](https://www.promptingguide.ai/models/phi-2) — Phi-2 QA format (Instruct/Output) confirmed distinct from Qwen ChatML

---
*Pitfalls research for: Semantic AI pipeline — Transformers.js + Qwen2.5-0.5B-Instruct in existing MV3 Chrome extension*
*Researched: 2026-02-20*
