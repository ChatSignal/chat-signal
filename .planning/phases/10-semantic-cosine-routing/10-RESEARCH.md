# Phase 10: Semantic Cosine Routing - Research

**Researched:** 2026-02-20
**Domain:** Cosine similarity classification, centroid prototype vectors, mode-switching UI
**Confidence:** HIGH — core math is trivial and well-understood; integration points are verified from existing codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seed phrases**
- Seed phrases stored in a config file (JSON or JS), not hardcoded — one file for all classification tuning
- 3-5 seed phrases per category (lean, fast to encode)
- Prototype vector per category is the average (centroid) of its seed phrase vectors
- Prototype vectors recomputed every time the sidebar opens — no caching across sessions

**Classification threshold**
- Per-category thresholds, not a single global threshold — each bucket can have its own similarity cutoff
- Thresholds stored in the same config file as seed phrases — one file for all tuning
- Below-threshold messages default to General Chat with full confidence — no "low-confidence" marker
- Tie-breaking: highest similarity wins (argmax) when a message scores above threshold for multiple categories

**Mode switching UX**
- "Semantic" or "Keyword" text badge displayed near the cluster section header — no special color coding, text only
- Automatic switching only — Semantic when encoder is ready, Keyword when it's not; no user toggle
- New messages only use the active mode — when switching from Keyword to Semantic mid-session, existing bucket assignments stay as-is (no reclassification)

**Fallback behavior**
- Badge shows "Keyword" when WASM keyword clustering is active — no extra fallback notices
- On gpu-unavailable event: attempt WASM-backend MiniLM encoding first (slower but still semantic)
- If WASM encoding is too slow: silent fallback to keyword mode — badge switches, no toast or warning
- Cosine routing is a standalone module (e.g., cosine-router.js) — separate from encoder-adapter.js

### Claude's Discretion

- Exact seed phrases for each category
- Config file format (JSON vs JS module)
- Starting threshold values per category
- WASM encoding speed threshold for fallback decision
- Exact badge styling and placement within the cluster section header

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLU-01 | Prototype cosine routing classifies messages into 4 existing buckets (Questions, Issues/Bugs, Requests, General Chat) using pre-computed category prototype vectors | Prototype vectors = centroid of seed phrase embeddings; cosine similarity against each prototype selects bucket; embeddings are L2-normalized so dot product equals cosine similarity — all verified from encoder-adapter.js and Phase 8 research |
| CLU-02 | Cosine similarity threshold (~0.35-0.45) determines classification; below-threshold messages default to General Chat | Per-category thresholds in config file; argmax wins when multiple categories exceed threshold; default-to-General-Chat for below-threshold is zero-fallback logic — no library needed |
</phase_requirements>

---

## Summary

Phase 10 classifies messages into the four existing buckets (Questions, Issues/Bugs, Requests, General Chat) using cosine similarity against pre-computed prototype vectors, replacing WASM keyword matching when the encoder is ready. The math is elementary: embeddings from the Phase 8 encoder are already L2-normalized (because `normalize: true` is passed to Transformers.js), which means cosine similarity reduces to a dot product. No external library is needed.

The prototype vectors are centroids of 3-5 seed phrase embeddings per category, computed once at encoder-ready time by calling `encodeMessages()` from `encoder-adapter.js`. From that point, classifying a message is O(n × 4) dot products where n is message count and 4 is the number of buckets. This is deterministic given fixed prototype vectors and seed phrases, satisfying the success criterion that the same message always routes to the same bucket.

The module is a new `cosine-router.js` alongside `encoder-adapter.js`. It holds prototype vectors as module-level state, exposes a `classifyMessage(embedding)` function, and coordinates with `sidebar.js` to: (1) replace the WASM bucket assignments when the encoder is ready, (2) display a text badge ("Semantic" or "Keyword") near the cluster section header, and (3) fall back silently to keyword mode when the encoder is unavailable or too slow.

**Primary recommendation:** Implement `cosine-router.js` as a pure math module (no I/O, no DOM) that takes normalized embeddings as input and returns bucket assignments. Wire it in `sidebar.js` after the existing encoder-ready path. Use a JS module for the config file (not JSON) so it's importable as a static ES module without fetch.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `encoder-adapter.js` (existing) | project | Provides `encodeMessages()` returning L2-normalized 384-dim arrays | Already ships, already integrated — prototype encoding reuses this exactly |
| Vanilla JS dot product | n/a | Cosine similarity on normalized vectors = dot product | L2-normalized vectors make library overkill; 384 multiplications is ~1μs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ES module `routing-config.js` | project | Stores seed phrases and per-category thresholds | Enables hot-reload of tuning params without code changes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JS module config (`routing-config.js`) | `routing-config.json` loaded via fetch | JS module is synchronously importable (no async fetch in the module init path); JSON would require an async load step before prototypes can be built. JSON preferred by some for tooling, but the async requirement makes it more complex for this use case. JS module wins. |
| Hand-rolled dot product | `ml-matrix`, `ndarray`, etc. | Libraries add weight and indirection; 384 floats × 4 buckets = 1536 multiplications per message — no library overhead justified |
| Storing prototypes in encoder-adapter.js | Standalone `cosine-router.js` | CONTEXT.md explicitly locks cosine routing as a separate module from encoder-adapter.js |

**Installation:** No new npm packages needed.

---

## Architecture Patterns

### Recommended Project Structure

```
extension/
└── sidebar/
    ├── encoder-adapter.js      # existing — provides encodeMessages(), getEncoderState()
    ├── cosine-router.js        # NEW — prototype math, classifyMessage(), mode state
    ├── routing-config.js       # NEW — seed phrases, per-category thresholds
    └── sidebar.js              # updated — wire badge, call cosine-router instead of WASM for routing
```

### Pattern 1: Prototype Vector Computation at Encoder-Ready Time

**What:** After `encoderReady = true` in `sidebar.js`, call `cosine-router.js` to encode the seed phrases and compute centroids.

**When to use:** Once, when encoder transitions to ready. Prototypes are session-scoped (no caching).

**Example:**
```javascript
// cosine-router.js

import { encodeMessages } from './encoder-adapter.js';
import { ROUTING_CONFIG } from './routing-config.js';

let prototypeVectors = null; // Map<string, number[]> — bucket label -> 384-dim centroid

/**
 * Encode seed phrases and compute one centroid per category.
 * Must be called after encoder is ready.
 * @returns {Promise<void>}
 */
async function buildPrototypes() {
  const allSeeds = [];
  for (const category of ROUTING_CONFIG.categories) {
    for (const phrase of category.seedPhrases) {
      allSeeds.push({ text: phrase });
    }
  }

  const embeddings = await encodeMessages(allSeeds); // Uses existing hash cache

  prototypeVectors = new Map();
  let idx = 0;
  for (const category of ROUTING_CONFIG.categories) {
    const count = category.seedPhrases.length;
    const categoryEmbeddings = embeddings.slice(idx, idx + count);
    prototypeVectors.set(category.label, computeCentroid(categoryEmbeddings));
    idx += count;
  }
  console.log('[CosinRouter] Prototypes built for', [...prototypeVectors.keys()].join(', '));
}

/**
 * Compute centroid (average) of an array of 384-dim vectors.
 * @param {number[][]} vectors
 * @returns {number[]} 384-dim centroid
 */
function computeCentroid(vectors) {
  const dim = vectors[0].length; // 384
  const centroid = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += vec[i];
    }
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) {
    centroid[i] /= n;
  }
  // Note: centroid of normalized vectors may not itself be normalized.
  // L2-normalize the centroid so dot products remain valid cosine similarities.
  return l2Normalize(centroid);
}

/**
 * L2-normalize a vector in-place.
 * @param {number[]} vec
 * @returns {number[]} normalized vector (same array)
 */
function l2Normalize(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}
```

**Source:** The L2 normalization requirement for centroid vectors is a standard property of cosine similarity — the centroid of normalized vectors is not itself normalized (its magnitude is < 1 in general). This is verified by elementary vector math; HIGH confidence.

### Pattern 2: Per-Message Cosine Classification (Dot Product)

**What:** Since input message embeddings are already L2-normalized by the encoder (verified in Phase 8: `normalize: true`), cosine similarity = dot product. For each message, compute similarity against all 4 prototype vectors, pick highest above threshold, default to General Chat.

**When to use:** After prototypes are built, called for each batch of messages.

**Example:**
```javascript
/**
 * Classify a single L2-normalized 384-dim embedding into a bucket.
 * @param {number[]} embedding — L2-normalized 384-dim vector (from encodeMessages)
 * @returns {string} bucket label
 */
function classifyMessage(embedding) {
  if (!prototypeVectors) {
    throw new Error('Prototypes not built — call buildPrototypes() first');
  }

  let bestLabel = 'General Chat'; // default
  let bestScore = -Infinity;

  for (const category of ROUTING_CONFIG.categories) {
    const proto = prototypeVectors.get(category.label);
    const score = dotProduct(embedding, proto); // cosine sim for normalized vectors

    if (score > category.threshold && score > bestScore) {
      bestScore = score;
      bestLabel = category.label;
    }
  }

  return bestLabel;
}

/**
 * Dot product of two equal-length arrays.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
```

### Pattern 3: Config File as JS Module

**What:** Store seed phrases and thresholds in a JS module exported as a plain object. Import it statically from `cosine-router.js`. No async fetch required.

**When to use:** Required because `cosine-router.js` needs config before any async operations, and JSON would require a fetch step.

**Example `routing-config.js`:**
```javascript
// routing-config.js
// One file for all cosine routing tuning.
// Claude's discretion: exact seed phrases and starting threshold values.

export const ROUTING_CONFIG = {
  categories: [
    {
      label: 'Questions',
      threshold: 0.35,
      seedPhrases: [
        'what is this',
        'how does this work',
        'can someone explain',
        'why is this happening',
        'what does that mean',
      ],
    },
    {
      label: 'Issues/Bugs',
      threshold: 0.35,
      seedPhrases: [
        'this is broken',
        'not working for me',
        'I found a bug',
        'error when trying',
        'something is wrong',
      ],
    },
    {
      label: 'Requests',
      threshold: 0.35,
      seedPhrases: [
        'please add this feature',
        'can you make it do',
        'I would like to see',
        'it would be great if',
        'suggestion for improvement',
      ],
    },
    {
      label: 'General Chat',
      threshold: 0.0, // catches everything — effectively the default
      seedPhrases: [
        'hello everyone',
        'great stream today',
        'love this content',
        'pog',
        'lol that was funny',
      ],
    },
  ],
};
```

**Note on General Chat seed phrases:** General Chat acts as a catch-all (below-threshold messages default to it anyway), so its seed phrases and threshold matter less than the other three. Starting threshold 0.0 for General Chat means it always wins as the fallback argmax if no other category exceeds its threshold — but the explicit below-threshold default logic runs first, making this moot. Functionally, General Chat prototype vector will only win the argmax when a message is genuinely more similar to General Chat content than to Questions/Issues/Requests.

### Pattern 4: Integrating the Router into sidebar.js

**What:** After encoder loads, call `buildPrototypes()`, then replace the WASM bucket routing with `classifyMessage()` for new messages. The badge DOM element switches text between "Semantic" and "Keyword".

**When to use:** Called from the existing `initEncoderOnStartup()` success path in `sidebar.js`.

**Integration points in sidebar.js:**

1. After `encoderReady = true` (around line 307), add:
   ```javascript
   await buildPrototypes();
   updateClusteringBadge('Semantic');
   ```

2. In `processMessages()`, after the encoder-ready gate (around line 474), call `routeWithCosine(messages, embeddings)` instead of relying solely on the WASM bucket output.

3. The WASM `analyze_chat_with_settings()` result is still used for **topics** and **sentiment** — only the **bucket assignments** are overridden by cosine routing when the encoder is ready.

4. On `gpu-unavailable` event (around line 196), add `updateClusteringBadge('Keyword')`.

**Badge DOM wiring:**

The badge lives near the cluster section. The `#clusters` div in `sidebar.html` currently has no header element — a section header with the badge needs to be added. Options:
- Add a `<div id="clusters-header">` with a `<span id="clustering-mode-badge">` before `<div id="clusters">` in HTML.
- Or create the badge element dynamically in `sidebar.js` and prepend it to `#clusters`.

The locked decision says "text badge ... near the cluster section header." A `<div id="clusters-header">` injected into the HTML is cleaner than dynamic creation.

### Pattern 5: Batch Classification (Replacing WASM Bucket Counts)

**What:** After getting embeddings for the current window of messages, run `classifyMessage()` on each, count by bucket, then build the bucket display structure that matches the existing shape `{ label, count, sample_messages[] }`.

**Why needed:** WASM `analyze_chat_with_settings()` returns buckets, but in Semantic mode those bucket assignments must be overridden. Topics and sentiment signals from WASM remain valid (they don't use bucket routing).

**Example:**
```javascript
// In sidebar.js, after embeddings are available
function buildSemanticBuckets(messages, embeddings) {
  const bucketMap = new Map([
    ['Questions', { label: 'Questions', count: 0, sample_messages: [] }],
    ['Issues/Bugs', { label: 'Issues/Bugs', count: 0, sample_messages: [] }],
    ['Requests', { label: 'Requests', count: 0, sample_messages: [] }],
    ['General Chat', { label: 'General Chat', count: 0, sample_messages: [] }],
  ]);

  messages.forEach((msg, i) => {
    const label = classifyMessage(embeddings[i]);
    const bucket = bucketMap.get(label);
    bucket.count++;
    if (bucket.sample_messages.length < 3) {
      bucket.sample_messages.push(msg.text);
    }
  });

  // Return only buckets with messages (consistent with WASM behavior)
  return [...bucketMap.values()].filter(b => b.count > 0);
}
```

### Pattern 6: Fallback Speed Threshold

**What:** CONTEXT.md says if WASM encoding is too slow, fall back to keyword mode silently. This requires measuring encoding time per batch.

**Implementation:** In `flushQueue()` of `encoder-adapter.js` (or in the `scheduleEncode` callback in `sidebar.js`), record encode time. If time-per-message exceeds a threshold, set a flag in the cosine router that switches the badge back to "Keyword". The exact threshold is Claude's discretion — a reasonable starting value is 200ms per message (WASM backend only; WebGPU should be well under this).

**How to measure:**
```javascript
// In sidebar.js, inside the scheduleEncode callback
scheduleEncode(messages, (batch, embeddings) => {
  const msPerMessage = /* measured in encoder-adapter */ / batch.length;
  if (msPerMessage > WASM_SPEED_THRESHOLD_MS) {
    setFallbackMode(); // badge → 'Keyword', skip cosine routing
  } else {
    const semanticBuckets = buildSemanticBuckets(batch, embeddings);
    renderSemanticBuckets(semanticBuckets);
  }
});
```

**Note:** `encoder-adapter.js` currently does not expose encoding time. Either:
- Measure time in `sidebar.js` by noting `Date.now()` before and after the callback fires (imprecise, includes callback overhead), or
- Add a timing return value to the `onBatchReady` callback signature in `encoder-adapter.js`.

The simpler approach: add `durationMs` to the callback parameters from `flushQueue`. That keeps timing logic inside `encoder-adapter.js` where the actual GPU call happens.

### Anti-Patterns to Avoid

- **Not L2-normalizing the centroid:** The centroid of normalized vectors is not normalized. Skipping `l2Normalize(centroid)` turns dot product into a scaled cosine similarity, making thresholds inconsistent across categories with different numbers of seed phrases.
- **Re-encoding seed phrases on every analysis cycle:** Seed phrase embeddings should be computed once at prototype-build time and held in memory. They can use the existing `embeddingCache` in `encoder-adapter.js` (same hash-based cache), so subsequent buildPrototypes() calls will be cache hits.
- **Overwriting WASM topics/sentiment with cosine results:** Cosine routing only replaces bucket assignments. Topics and sentiment come from WASM and are correct regardless of clustering mode.
- **Making General Chat threshold 0.35 like the others:** If the General Chat prototype competes with Questions/Issues/Requests at the same threshold, ambiguous messages may incorrectly prefer General Chat. The correct design is: check non-General-Chat categories first; if none exceed their threshold, assign General Chat. The config structure should reflect this ordering.
- **Caching prototype vectors across sidebar sessions:** CONTEXT.md locks "recomputed every time the sidebar opens." Do not persist prototypes to `chrome.storage`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cosine similarity on normalized vectors | Custom similarity library | Dot product loop (4 lines) | Embeddings are already L2-normalized by the encoder — cosine sim = dot product; no library needed |
| L2 normalization | External math library | 8-line function | Simple inner-product + sqrt; done inline |
| Seed phrase management | Database or API | Static JS module | 3-5 phrases × 4 categories = ≤ 20 strings; any DB is overkill |
| Prototype storage | IndexedDB / chrome.storage | Module-level variable | Session-scoped by design; no persistence needed |

**Key insight:** All the heavy lifting (embedding computation, GPU access, caching) is already in `encoder-adapter.js`. The cosine router itself is pure synchronous JavaScript — under 100 lines of math.

---

## Common Pitfalls

### Pitfall 1: Centroid Not Normalized

**What goes wrong:** Prototype vectors have magnitude < 1 because they are the average of multiple normalized vectors. Dot product against an un-normalized centroid no longer equals cosine similarity — thresholds calibrated for [0, 1] range will be incorrect.

**Why it happens:** Easy to forget that averaging unit vectors doesn't produce a unit vector.

**How to avoid:** Always `l2Normalize(centroid)` after computing the average. Add an assertion in dev mode: `Math.abs(dotProduct(proto, proto) - 1) < 0.001`.

**Warning signs:** Similarity scores consistently lower than expected (< 0.2) even for clearly-matching messages.

### Pitfall 2: Building Prototypes Before Encoder Is Ready

**What goes wrong:** `encodeMessages()` returns null when called before the pipeline is ready, causing a null-reference error or silently producing undefined prototypes.

**Why it happens:** `initEncoderOnStartup()` in `sidebar.js` is fire-and-forget; if `buildPrototypes()` is called too early (e.g. on `encodeReady = true` assignment before the await resolves fully), the pipeline may not be ready.

**How to avoid:** Call `buildPrototypes()` only after the `initEncoderWithRetry()` promise resolves successfully (result !== null). Use the existing `encoderReady = true` assignment point as the trigger.

**Warning signs:** `encodeMessages()` logs "pipeline not ready"; cosine routing never activates.

### Pitfall 3: Mid-Session Mode Switch Reclassifying Old Messages

**What goes wrong:** When the encoder becomes ready mid-session, previously accumulated messages get re-routed to different buckets, causing visible bucket count jumps that confuse users.

**Why it happens:** If `buildSemanticBuckets()` is applied to the full `allMessages` window on encoder-ready, all historical messages get reclassified.

**How to avoid:** CONTEXT.md locks "new messages only use the active mode." Only apply cosine routing to messages encoded after prototypes are built. Track a `semanticStartIdx` (index in `allMessages` where cosine routing began). Messages before that index keep their WASM assignments.

**Simpler approach:** Since `processMessages()` operates on the current window and renders fresh each cycle, simply don't backfill: when `encoderReady` flips true, the next `processMessages()` call will use cosine routing for the full window. This means the transition is not instant (it happens on the next analysis cycle), which is acceptable.

**Warning signs:** Bucket counts jump noticeably when encoder initializes during an active session.

### Pitfall 4: General Chat Threshold Competing with Other Categories

**What goes wrong:** General Chat prototype is "close" to everyday chat messages, causing argmax to route questions/issues/requests to General Chat when they're only weakly above threshold for their true category.

**Why it happens:** General Chat seed phrases cover friendly, casual messages — but the prototype may generalize broadly.

**How to avoid:** Two design approaches:
1. Set General Chat as the unconditional default (skip it from the argmax comparison). Classify against Questions/Issues/Requests only; if none win, assign General Chat.
2. Use a lower starting threshold for General Chat (0.0 effective threshold) so it only wins the argmax when no other category is competitive.

Approach 1 is simpler and more robust. Implement as: iterate only non-General-Chat categories in argmax; if bestLabel stays null (no category exceeded threshold), assign 'General Chat'.

**Warning signs:** High percentage of messages appearing in General Chat bucket even when chat clearly contains questions or bug reports.

### Pitfall 5: Encode Time Measurement Inaccuracy

**What goes wrong:** Measuring encode time per message in `sidebar.js` by timing the entire callback includes queue wait time, not just inference time. This produces inflated measurements that trigger unnecessary fallback.

**Why it happens:** `scheduleEncode` callback fires asynchronously after the GPU scheduler processes the task. Time between `scheduleEncode` call and callback invocation includes queue depth wait.

**How to avoid:** Measure encode time inside `encoder-adapter.js`'s `flushQueue()`, specifically the duration of the `encodeMessages()` call itself. Pass `durationMs` as a third argument to `onBatchReady`. This is inference time only.

**Warning signs:** Semantic mode falls back to Keyword mode even though GPU is fast; logs show large durationMs values disproportionate to batch size.

### Pitfall 6: Threshold Calibration Against Wrong Domain

**What goes wrong:** The 0.35 threshold from REQUIREMENTS.md comes from support ticket literature (NLP classification research). Stream chat is shorter, noisier, and more ambiguous — the threshold may need to be lower (0.25) to catch enough messages, or the routing may produce an overwhelming General Chat bucket.

**Why it happens:** MiniLM-L6-v2 was trained on longer, well-formed sentences. Stream chat messages ("how do i do this?", "this doesnt work lol") are fragmentary and may produce lower peak similarities to prototype vectors.

**How to avoid:** Treat 0.35 as a starting point. The STATE.md already documents this concern: "cosine threshold default (0.35) needs calibration against live stream chat." Start low (0.25-0.30) and observe bucket distribution. The config file design enables fast iteration.

**Warning signs:** > 85% of messages routing to General Chat even in a chat dominated by questions; Questions bucket shows < 5% of messages.

---

## Code Examples

### Complete `routing-config.js` Starter

```javascript
// routing-config.js
// Source: Claude's discretion — seed phrases tunable post-implementation

export const ROUTING_CONFIG = {
  // Per-category tuning. One entry per bucket.
  // label must exactly match the WASM engine bucket labels.
  categories: [
    {
      label: 'Questions',
      threshold: 0.30,  // Starting point — calibrate against live chat
      seedPhrases: [
        'what is this',
        'how does this work',
        'can someone explain',
        'why is this happening',
        'what does that mean',
      ],
    },
    {
      label: 'Issues/Bugs',
      threshold: 0.30,
      seedPhrases: [
        'this is broken',
        'not working for me',
        'I found a bug',
        'getting an error',
        'something is wrong here',
      ],
    },
    {
      label: 'Requests',
      threshold: 0.30,
      seedPhrases: [
        'please add this feature',
        'can you make it',
        'I would like to see',
        'it would be great if',
        'suggestion for improvement',
      ],
    },
    // General Chat is the implicit default — not included in argmax search
  ],
  // Fallback: label to use when no category exceeds threshold
  defaultLabel: 'General Chat',
  // WASM encoding speed threshold (ms per message) above which we fall back to keyword mode
  wasmSpeedThresholdMsPerMessage: 200,
};
```

### `cosine-router.js` Module Structure

```javascript
// cosine-router.js
// Standalone cosine similarity routing module.
// No DOM access, no chrome APIs — pure math + encoder calls.

import { encodeMessages } from './encoder-adapter.js';
import { ROUTING_CONFIG } from './routing-config.js';

// Module-level state — session-scoped (not persisted)
let _prototypeVectors = null; // Map<string, number[]> — label → 384-dim centroid
let _mode = 'keyword';        // 'semantic' | 'keyword'

// ─── Public API ──────────────────────────────────────────────────────────────

/** Build prototype vectors from seed phrases. Call once after encoder is ready. */
async function buildPrototypes() { /* see Pattern 1 */ }

/** Classify a single L2-normalized embedding. Returns bucket label string. */
function classifyMessage(embedding) { /* see Pattern 2 */ }

/** Classify an array of messages given their embeddings. Returns string[]. */
function classifyBatch(messages, embeddings) {
  return embeddings.map(emb => classifyMessage(emb));
}

/** Check if prototypes are built and cosine routing is available. */
function isSemanticReady() {
  return _prototypeVectors !== null && _mode === 'semantic';
}

/** Switch to semantic mode (called after buildPrototypes() succeeds). */
function setSemanticMode() { _mode = 'semantic'; }

/** Switch back to keyword mode (called on gpu-unavailable or slow WASM). */
function setKeywordMode() {
  _mode = 'keyword';
  // Note: do NOT clear _prototypeVectors — if encoder recovers, setSemanticMode()
  // re-enables routing without needing to rebuild (prototypes are still valid)
}

/** Get current mode string for badge display. */
function getMode() { return _mode; }

export { buildPrototypes, classifyMessage, classifyBatch, isSemanticReady, setSemanticMode, setKeywordMode, getMode };

// ─── Internal ─────────────────────────────────────────────────────────────────

function computeCentroid(vectors) { /* see Pattern 1 */ }
function l2Normalize(vec) { /* see Pattern 1 */ }
function dotProduct(a, b) { /* see Pattern 2 */ }
```

### sidebar.js Integration Points

```javascript
// Additions to sidebar.js (not the full file, only changed sections)

import { buildPrototypes, classifyBatch, isSemanticReady, setSemanticMode, setKeywordMode, getMode } from './cosine-router.js';

// 1. In initEncoderOnStartup(), after encoderReady = true:
encoderReady = true;
await buildPrototypes();
setSemanticMode();
updateClusteringBadge('Semantic');

// 2. In processMessages(), replace the scheduleEncode callback:
if (encoderReady && isSemanticReady()) {
  scheduleEncode(messages, (batch, embeddings, durationMs) => {
    const msPerMessage = durationMs / batch.length;
    if (msPerMessage > ROUTING_CONFIG.wasmSpeedThresholdMsPerMessage) {
      setKeywordMode();
      updateClusteringBadge('Keyword');
      // Fall through to WASM bucket rendering already done above
      return;
    }
    const labels = classifyBatch(batch, embeddings);
    const semanticBuckets = buildSemanticBuckets(batch, labels);
    renderBuckets(semanticBuckets); // replaces WASM bucket render for this cycle
  });
}

// 3. GPU loss handler (already in sidebar.js around line 196):
window.addEventListener('gpu-unavailable', (event) => {
  encoderReady = false;
  setKeywordMode();
  updateClusteringBadge('Keyword');
});

// 4. Badge update helper:
function updateClusteringBadge(mode) {
  const badge = document.getElementById('clustering-mode-badge');
  if (badge) badge.textContent = mode;
}
```

### HTML Badge Addition

```html
<!-- sidebar.html — clusters section with badge header -->
<!-- Add before <div id="clusters"> -->
<div id="clusters-header" class="clusters-header hidden">
  <h3 class="clusters-title">Clusters</h3>
  <span id="clustering-mode-badge" class="clustering-mode-badge">Keyword</span>
</div>
<div id="clusters" class="clusters">
  <!-- Cluster buckets will be inserted here -->
</div>
```

### CSS for Badge

```css
/* sidebar.css additions — Claude's discretion on exact styling */
.clusters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.clusters-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.clustering-mode-badge {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keyword matching (WASM) | Prototype cosine routing (Phase 10) | This phase | Higher accuracy on semantically clear messages; same 4-bucket output structure |
| Single global threshold for all classes | Per-category thresholds | Locked decision | Each category can be tuned independently; General Chat threshold can be 0 while Questions threshold is 0.30 |
| K-Means / DBSCAN dynamic clustering | Fixed prototype routing | Design decision (REQUIREMENTS.md) | O(n×4) deterministic classification vs. O(n×k) iterative clustering; maps to fixed 4-bucket UI |

**Not in scope and why:**
- Adaptive thresholds (CLU-03): deferred to future requirements
- Confidence scores per message (CLU-04): deferred
- User-configurable categories (CLU-05): deferred

---

## Open Questions

1. **Threshold starting values (0.25-0.35)**
   - What we know: Requirements say ~0.35-0.45; STATE.md notes this "needs calibration against live stream chat"; literature values are from support ticket domain
   - What's unclear: What similarity distribution MiniLM produces for stream chat messages
   - Recommendation: Start at 0.30 for all non-General-Chat categories; calibrate by observing bucket distribution during testing. The config file makes this a one-line change per category.

2. **Encode time measurement: where to add durationMs**
   - What we know: `encoder-adapter.js` `flushQueue()` calls `encodeMessages()` which calls `scheduleGpuTask()`; timing should be measured inside that call
   - What's unclear: Whether to add `durationMs` to the existing `onBatchReady(batch, embeddings)` callback signature (breaking change) or wrap it in an object
   - Recommendation: Add `durationMs` as a third param: `onBatchReady(batch, embeddings, durationMs)`. Existing callers that ignore extra params are unaffected in JavaScript. This is the minimal-impact change.

3. **Badge visibility when clusters are hidden**
   - What we know: The `#clusters` div is always present but may be empty; no section header currently exists above it
   - What's unclear: Should the clusters-header be hidden when no clusters are rendered?
   - Recommendation: Show the badge as soon as analysis is active (same time as the cluster buckets first appear). Add `clusters-header` to the same show/hide logic as the clusters section in `processMessages()`.

4. **Interaction with catch-up encoding**
   - What we know: When encoder loads mid-session, `sidebar.js` runs catch-up encoding of `allMessages` (line 316). If `buildPrototypes()` completes before catch-up, the catch-up callback could run `buildSemanticBuckets()` on the backlog.
   - What's unclear: Should catch-up encoding trigger cosine bucket rendering?
   - Recommendation: No. Catch-up encoding is for the embedding cache (ENC-05 compliance), not for reclassifying old messages. The catch-up callback should remain a no-op for bucket rendering. New analysis cycles will use cosine routing going forward. This aligns with the CONTEXT.md lock: "existing bucket assignments stay as-is."

---

## Sources

### Primary (HIGH confidence)

- `/home/john/vault/projects/github.com/chat-signal-radar/extension/sidebar/encoder-adapter.js` — confirms `normalize: true` in pipeline call (line 176, 271); `encodeMessages()` return type is `number[][]`; `embeddingCache` is hash-keyed; `scheduleEncode` signature is `(messages, onBatchReady)`
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/sidebar/sidebar.js` — confirms `encoderReady` flag location (line 96, 307); `scheduleEncode` call (line 550); `gpu-unavailable` handler (line 196); `#clusters` DOM structure (line 70 in HTML)
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/sidebar/sidebar.html` — confirms no existing cluster header; `#clusters` div is the insertion point
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/sidebar/sidebar.css` — confirms CSS variable system for theming; `.cluster-header` pattern for reference
- `.planning/phases/08-encoder-foundation/08-RESEARCH.md` — confirms "Cosine similarity (Phase 10): Embeddings are already L2-normalized — dot product equals cosine similarity" in Don't Hand-Roll section
- `.planning/phases/10-semantic-cosine-routing/10-CONTEXT.md` — all locked decisions
- `.planning/REQUIREMENTS.md` — CLU-01, CLU-02 definitions; threshold range 0.35-0.45
- `.planning/STATE.md` — "Phase 10 gate: cosine threshold default (0.35) needs calibration against live stream chat"

### Secondary (MEDIUM confidence)

- Elementary vector math: centroid of unit vectors is not a unit vector (magnitude < 1); must re-normalize. This is a standard linear algebra fact; HIGH confidence independently of sources.
- MiniLM-L6-v2 cosine similarity distribution for short noisy text: expected to produce lower peak similarities than longer well-formed sentences. This is LOW confidence without empirical measurement on stream chat data.

### Tertiary (LOW confidence)

- Threshold value 0.35: sourced from NLP literature on sentence classification tasks (support tickets, product reviews). Applicability to stream chat is LOW confidence — treat as starting point only.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; math verified from first principles; encoder integration points verified in source code
- Architecture (module structure, integration points): HIGH — all integration points verified in existing source; pattern matches encoder-adapter.js precedent
- Centroid normalization requirement: HIGH — elementary vector math
- Threshold values: LOW — domain mismatch (literature vs. stream chat); calibration required
- Seed phrases: LOW (Claude's discretion) — reasonable starting set, needs live chat testing

**Research date:** 2026-02-20
**Valid until:** 2026-04-20 (math is stable; only encoder-adapter.js API could change if Phase 11 modifies it)
