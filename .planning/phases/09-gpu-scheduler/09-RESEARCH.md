# Phase 9: GPU Scheduler - Research

**Researched:** 2026-02-20
**Domain:** JavaScript async task serialization, WebGPU device lifecycle
**Confidence:** HIGH (core queue/mutex pattern), MEDIUM (WebGPU concurrent-session behavior)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Queue behavior**
- Single shared queue — one queue with tasks tagged by type, priority determines ordering
- Drop-oldest policy when queue is full — stale encoder batches are irrelevant since fresh chat data supersedes them
- Queue depth capped at 5-10 tasks (Claude picks exact number within this range)
- Silent drops — callers fire-and-forget; the next analysis cycle picks up fresh data anyway

**Priority & preemption**
- Hardcoded priority levels: encoder = priority 1, SLM = priority 2
- Weighted fairness — encoder gets priority but SLM gets guaranteed slots to avoid starvation (Claude picks the ratio)
- No preemption — never interrupt a running task; encoder waits until the current SLM call finishes before starting

**Observability**
- Developer-only — no GPU scheduler indicators in the sidebar UI
- Minimal console logging by default — only log errors and dropped tasks
- Always-on internal audit — scheduler records start/end timestamps in memory (not console) for verifying non-overlapping execution
- Status API exposed — `getStatus()` method returns queue depth, active task type, and last execution timestamps for other modules to query

**Failure handling**
- Caller handles errors — scheduler reports the error; encoder/SLM decide whether to retry or fall back
- 30-second timeout per GPU task — tasks exceeding this are cancelled and error returned to caller
- Broadcast 'gpu-unavailable' event when WebGPU becomes permanently unavailable (context lost, GPU reset) so consumers can switch to WASM backends

### Claude's Discretion
- Exact queue depth within the 5-10 range
- Weighted fairness ratio (encoder:SLM turn allocation)
- Internal audit data structure and retention
- Exact timeout implementation (AbortController, Promise.race, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GPU-01 | Dedicated GPU scheduler module (`gpu-scheduler.js`) serializes WebGPU access between encoder and SLM via promise-queue mutex | Promise-chain mutex pattern (no external library needed) confirmed as standard approach; fits zero-dependency browser extension constraint |
| GPU-02 | Encoder has priority 1 (runs every batch); SLM has priority 2 (waits for encoder to finish before starting) | Weighted-slot fairness pattern documented; simple counter-based approach avoids starvation without external priority-queue library |
</phase_requirements>

---

## Summary

Phase 9 builds a pure-JavaScript GPU scheduler module that sits between callers (encoder-adapter, llm-adapter) and the WebGPU device. Its job is to ensure only one GPU task runs at a time, enforce encoder-first priority with SLM starvation prevention, and broadcast a 'gpu-unavailable' event when WebGPU is permanently lost.

The core mechanism is a **promise-chain mutex**: a single `_tail` promise that each new task chains off of. This is a zero-dependency, well-understood pattern that requires no npm packages and works identically in browser extension sidebar pages. A second concern is **WebGPU device loss**: the `device.lost` promise resolves when the GPU is unexpectedly lost, and the scheduler must listen for this to flip a permanent-unavailable flag and stop enqueuing new tasks. Both patterns are verified against authoritative sources.

The open question is whether ONNX Runtime Web enforces its own GPU serialization internally. Documentation does not address concurrent session behavior explicitly. The safe assumption — and the one required by the requirements — is that it does not, and the scheduler is the sole serialization layer.

**Primary recommendation:** Hand-roll a minimal promise-chain scheduler (< 150 lines). No external library needed. The async-mutex npm package would work but adds a dependency for functionality that is trivially built with five lines of promise chaining.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native JavaScript Promises | ES2015+ | Task serialization via promise chaining | No dependency, works in all browser extension contexts |
| `AbortSignal.timeout()` | Chrome 103+ | 30-second task timeout without external timers | Modern standard; cleaner than `Promise.race` + `setTimeout` manual cleanup |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `async-mutex` (npm) | 1.5.x | Pre-built Mutex/Semaphore with priority support | Would eliminate hand-rolling, but adds an npm dependency; extension uses no npm bundler currently |
| `EventTarget` (built-in) | Browser native | Event bus for 'gpu-unavailable' broadcast | Use `window.dispatchEvent(new CustomEvent(...))` for module-decoupled signalling |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled promise-chain mutex | `async-mutex` npm package | async-mutex is well-tested and has priority support via Semaphore, but adds a build step; hand-rolled is 5-10 lines and sufficient for two task types |
| `AbortSignal.timeout()` | `Promise.race(task, sleep(30000))` | `AbortSignal.timeout()` is cleaner and cancels the signal automatically; `Promise.race` leaves the losing promise dangling in memory |
| `window.dispatchEvent(CustomEvent)` | `chrome.runtime.sendMessage` | CustomEvent is synchronous and stays within the same page context (sidebar); no round-trip through background worker needed |

**Installation:** No npm packages required. All APIs are browser-native.

---

## Architecture Patterns

### Recommended Project Structure

```
extension/sidebar/modules/
├── gpu-scheduler.js      # NEW: this phase
├── SessionManager.js     # existing
└── StateManager.js       # existing
```

`gpu-scheduler.js` is a plain ES6 module with no DOM dependencies. It exports a singleton API that `sidebar.js`, `encoder-adapter.js`, and (Phase 11) `llm-adapter.js` call instead of executing GPU work directly.

### Pattern 1: Promise-Chain Mutex (Serial Queue)

**What:** Each task appends itself to a shared tail promise. The tail always points to the most recently queued task's completion. Tasks execute one at a time in submission order.

**When to use:** Any time you need guaranteed serial execution of async operations in a browser context with no build tooling.

**Example:**
```javascript
// Source: well-established JS pattern; see blog.mayflower.de/6369 for explanation
class GpuScheduler {
  #tail = Promise.resolve(); // chain root — always resolved initially

  enqueue(taskFn) {
    // Each task waits for the previous tail to settle before running
    const next = this.#tail.then(() => taskFn());
    // New tail: this task's completion (errors must NOT break the chain)
    this.#tail = next.catch(() => {}); // swallow so chain never breaks
    return next; // caller gets original promise (with error propagation)
  }
}
```

**Critical detail:** The `this.#tail` reference must catch errors internally (`catch(() => {})`), otherwise a rejected task breaks the chain and all subsequent tasks hang forever. The caller-facing promise (`next`) is returned unchanged so the caller still receives the error.

### Pattern 2: Weighted-Slot Fairness (Starvation Prevention)

**What:** A counter tracks how many consecutive encoder tasks have run. Once the encoder has run N times in a row, the next available SLM task jumps the queue regardless of priority ordering.

**When to use:** Two-consumer priority queues where the lower-priority consumer must still make progress.

**Example:**
```javascript
// Claude's discretion: 4:1 ratio (encoder:SLM)
// After 4 consecutive encoder runs, force one SLM slot
const ENCODER_BURST_LIMIT = 4;
let consecutiveEncoderRuns = 0;

function selectNextTask(queue) {
  const hasSLM = queue.some(t => t.type === 'slm');
  const forceSLM = hasSLM && consecutiveEncoderRuns >= ENCODER_BURST_LIMIT;

  if (forceSLM) {
    consecutiveEncoderRuns = 0;
    return queue.findIndex(t => t.type === 'slm');
  }

  // Normal priority ordering: encoder (1) before SLM (2)
  const idx = queue.findIndex(t => t.priority === 1);
  if (idx !== -1) {
    consecutiveEncoderRuns++;
    return idx;
  }

  consecutiveEncoderRuns = 0;
  return 0; // next SLM task
}
```

### Pattern 3: 30-Second Timeout via AbortSignal

**What:** Wrap the GPU task with `AbortSignal.timeout()` and `Promise.race` to enforce a hard deadline. On timeout, return an error to the caller.

**When to use:** Any GPU task that may hang indefinitely (WebGPU pipeline stalls, model inference hangs).

**Example:**
```javascript
// Source: MDN AbortSignal.timeout() — Chrome 103+, Firefox 100+, Safari 15.4+
const GPU_TIMEOUT_MS = 30_000;

async function runWithTimeout(taskFn) {
  const signal = AbortSignal.timeout(GPU_TIMEOUT_MS);

  const timeoutPromise = new Promise((_, reject) => {
    signal.addEventListener('abort', () =>
      reject(new DOMException('GPU task timed out after 30s', 'TimeoutError'))
    );
  });

  return Promise.race([taskFn(), timeoutPromise]);
}
```

Note: `AbortSignal.timeout()` does not cancel the underlying taskFn (Transformers.js pipelines don't support AbortSignal). It only races the return promise. The GPU operation itself may continue running until the model's internal completion, but the scheduler treats it as failed and moves on.

### Pattern 4: WebGPU Device Loss Detection

**What:** Attach a `.then()` handler to `device.lost` immediately after device acquisition. When it resolves, determine if the loss is permanent (set 'gpu-unavailable' flag) and broadcast an event.

**When to use:** Any code that holds a `GPUDevice` reference.

**Example:**
```javascript
// Source: MDN GPUDevice.lost + toji.dev/webgpu-best-practices/device-loss.html
function watchDeviceLoss(device) {
  // Do NOT await — this promise never resolves during normal operation
  device.lost.then((info) => {
    console.error(`[GPUScheduler] WebGPU device lost: ${info.message}`);

    // 'destroyed' = intentional (our own cleanup), not a fault
    if (info.reason !== 'destroyed') {
      gpuPermanentlyUnavailable = true;
      window.dispatchEvent(new CustomEvent('gpu-unavailable', {
        detail: { reason: info.reason, message: info.message }
      }));
    }
  });
}
```

### Pattern 5: Drop-Oldest Queue Management

**What:** When the queue is at capacity, remove the oldest task of the same type before adding the new one. Encoder tasks are always stale by the next analysis cycle; SLM tasks may be more valuable to keep, but the decision is symmetric.

**When to use:** High-frequency producer, slow consumer — streaming chat analysis.

**Example:**
```javascript
// Claude's discretion: queue depth = 8 (mid-range of 5-10)
const MAX_QUEUE_DEPTH = 8;

function addToQueue(queue, task) {
  if (queue.length >= MAX_QUEUE_DEPTH) {
    // Drop oldest task of the same type (stale data)
    const oldestSameType = queue.findIndex(t => t.type === task.type);
    if (oldestSameType !== -1) {
      const dropped = queue.splice(oldestSameType, 1)[0];
      console.log(`[GPUScheduler] Dropped stale ${dropped.type} task (queue full)`);
    } else {
      // No same-type task to drop — drop oldest overall
      const dropped = queue.shift();
      console.log(`[GPUScheduler] Dropped oldest task (${dropped.type}) — queue full`);
    }
  }
  queue.push(task);
}
```

### Pattern 6: Internal Audit Log (Non-Overlapping Verification)

**What:** Record `{ type, startMs, endMs }` entries in a circular buffer. `getStatus()` exposes the last N entries. Because this is memory-only and not logged to console, it has zero production overhead.

**Example:**
```javascript
// Claude's discretion: 20-entry ring buffer
const AUDIT_SIZE = 20;
const auditLog = [];

function recordAudit(type, startMs, endMs) {
  auditLog.push({ type, startMs, endMs });
  if (auditLog.length > AUDIT_SIZE) auditLog.shift();
}

// Verification: no two entries should have overlapping [startMs, endMs] ranges
function verifyNonOverlapping() {
  for (let i = 1; i < auditLog.length; i++) {
    if (auditLog[i].startMs < auditLog[i - 1].endMs) {
      console.error('[GPUScheduler] OVERLAP DETECTED', auditLog[i - 1], auditLog[i]);
      return false;
    }
  }
  return true;
}
```

### Anti-Patterns to Avoid

- **Awaiting `device.lost` at the top level:** This promise never resolves during normal operation, so `await device.lost` will hang the calling function indefinitely. Always attach `.then()` without `await`.
- **Breaking the promise chain on error:** If `this.#tail` is set to a rejected promise, all future tasks will skip execution. Always use `.catch(() => {})` on `this.#tail` but not on the returned promise.
- **Using `chrome.runtime.sendMessage` for GPU events:** The 'gpu-unavailable' event should stay within the sidebar page context (`window.dispatchEvent`). Using chrome messaging adds async round-trips and wakes the background service worker unnecessarily.
- **Parsing `GPUDeviceLostInfo.message` for logic:** The message string is implementation-defined and unstable across browsers. Only use `info.reason` ('destroyed' vs everything else).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mutex with cancellation, priority, TypeScript types | Custom mutex class | `async-mutex` npm | Well-tested, handles edge cases in cancel() and release() ordering — but only worth adding if a bundler is already in place |
| Timeout with auto-cleanup | `setTimeout` + `clearTimeout` pair | `AbortSignal.timeout()` | Native API handles cleanup; `setTimeout` approach leaks if promise resolves before timeout fires |

**Key insight:** For this specific phase (two task types, no bundler, no TypeScript), a hand-rolled 80-120 line module is the right call. Do not add `async-mutex` as a vendored dependency just for this.

---

## Common Pitfalls

### Pitfall 1: Promise Chain Breakage on Task Error
**What goes wrong:** A GPU task throws an unhandled error. The `this.#tail` promise rejects. All subsequent tasks chained off `#tail` never execute — the queue appears empty but processes nothing.
**Why it happens:** `Promise.then()` propagates rejections downstream.
**How to avoid:** Always set `this.#tail = next.catch(() => {})` — the internal tail silently absorbs errors. The returned `next` promise (given to the caller) propagates errors normally.
**Warning signs:** Queue depth stays at 0 but encoder results stop arriving after a single WebGPU error.

### Pitfall 2: Awaiting `device.lost`
**What goes wrong:** Calling `await device.lost` in any code path. The promise never resolves during normal operation, so the function hangs.
**Why it happens:** `device.lost` is designed to be a signal, not an awaitable result.
**How to avoid:** Always use `device.lost.then(handler)` — fire and forget the handler attachment.
**Warning signs:** Encoder init or scheduler init appears to hang indefinitely.

### Pitfall 3: Timeout Doesn't Actually Stop the GPU Work
**What goes wrong:** `AbortSignal.timeout()` races the promise correctly and the scheduler moves on, but the underlying Transformers.js pipeline continues using the GPU. A second task starts and now two tasks overlap.
**Why it happens:** `Promise.race` doesn't cancel the losing promise. Transformers.js pipelines don't expose AbortSignal internally.
**How to avoid:** After a timeout, set a `gpuBusy` flag and wait an additional grace period (e.g., 2s) before starting the next task — or accept that timeout = GPU in unknown state = next task may get a device-lost error and the error handler recovers. The latter is simpler and consistent with "caller handles errors."
**Warning signs:** Two consecutive tasks, one timed out, second gets WebGPU validation error about submitted command buffer.

### Pitfall 4: Drop-Oldest Drops the Wrong Task
**What goes wrong:** A full queue has 8 encoder tasks. A new SLM task arrives. Drop-oldest removes the oldest encoder task (good) — but the new SLM task has lowest priority and sits at the back. If encoder tasks keep arriving, SLM never runs (starvation through enqueue, not through execution order).
**Why it happens:** Drop-oldest removes by age, not by type relevance.
**How to avoid:** Apply the weighted-fairness burst limit at enqueue time too: if consecutiveEncoderRuns >= ENCODER_BURST_LIMIT and an SLM task is waiting, prioritize keeping the SLM task when dropping.

### Pitfall 5: `getStatus()` Called Before Any Task Runs
**What goes wrong:** Caller calls `getStatus()` immediately; `activeTask` is null, `auditLog` is empty. Caller code crashes on `lastExecution.endMs`.
**Why it happens:** Status API returns empty/null values on a fresh scheduler.
**How to avoid:** Return a well-defined zero-state from `getStatus()`: `{ queueDepth: 0, activeTask: null, auditLog: [], gpuAvailable: true }`. Document that callers must null-check `activeTask`.

---

## Code Examples

Verified patterns from official sources:

### Complete Minimal Scheduler Skeleton
```javascript
// gpu-scheduler.js
// Source: promise-chain mutex pattern (blog.mayflower.de) +
//         WebGPU device loss (MDN + toji.dev) +
//         AbortSignal.timeout (MDN)

const MAX_QUEUE_DEPTH = 8;          // Claude's discretion: mid-range of 5-10
const GPU_TIMEOUT_MS = 30_000;
const ENCODER_BURST_LIMIT = 4;      // Claude's discretion: 4:1 encoder:SLM ratio
const AUDIT_SIZE = 20;

let _tail = Promise.resolve();       // promise-chain root
let _queue = [];                     // pending tasks (not yet running)
let _activeTask = null;              // currently running task descriptor
let _gpuAvailable = true;
let _consecutiveEncoderRuns = 0;
const _auditLog = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function scheduleGpuTask(type, priority, taskFn) {
  if (!_gpuAvailable) {
    console.log(`[GPUScheduler] GPU unavailable — dropping ${type} task`);
    return Promise.reject(new Error('gpu-unavailable'));
  }

  return new Promise((resolve, reject) => {
    const entry = { type, priority, taskFn, resolve, reject };
    _addToQueue(entry);
    _drainQueue();
  });
}

function getStatus() {
  return {
    queueDepth: _queue.length,
    activeTask: _activeTask ? { type: _activeTask.type } : null,
    auditLog: [..._auditLog],
    gpuAvailable: _gpuAvailable,
  };
}

function registerDevice(device) {
  // Attach device-loss watcher — do NOT await
  device.lost.then((info) => {
    console.error(`[GPUScheduler] WebGPU device lost: ${info.message}`);
    if (info.reason !== 'destroyed') {
      _gpuAvailable = false;
      window.dispatchEvent(new CustomEvent('gpu-unavailable', {
        detail: { reason: info.reason, message: info.message }
      }));
    }
  });
}

export { scheduleGpuTask, getStatus, registerDevice };

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _addToQueue(entry) {
  if (_queue.length >= MAX_QUEUE_DEPTH) {
    // Drop oldest task of same type first; otherwise drop oldest overall
    const sameTypeIdx = _queue.findIndex(t => t.type === entry.type);
    const dropIdx = sameTypeIdx !== -1 ? sameTypeIdx : 0;
    const dropped = _queue.splice(dropIdx, 1)[0];
    console.log(`[GPUScheduler] Dropped stale ${dropped.type} task (queue full)`);
    dropped.reject(new Error('task-dropped'));
  }
  _queue.push(entry);
}

function _selectNext() {
  if (_queue.length === 0) return -1;

  const hasSLM = _queue.some(t => t.type === 'slm');
  const forceSLM = hasSLM && _consecutiveEncoderRuns >= ENCODER_BURST_LIMIT;

  if (forceSLM) {
    _consecutiveEncoderRuns = 0;
    return _queue.findIndex(t => t.type === 'slm');
  }

  const encoderIdx = _queue.findIndex(t => t.priority === 1);
  if (encoderIdx !== -1) {
    _consecutiveEncoderRuns++;
    return encoderIdx;
  }

  _consecutiveEncoderRuns = 0;
  return 0;
}

function _drainQueue() {
  _tail = _tail.then(async () => {
    const idx = _selectNext();
    if (idx === -1) return;

    const entry = _queue.splice(idx, 1)[0];
    _activeTask = entry;
    const startMs = Date.now();

    try {
      const signal = AbortSignal.timeout(GPU_TIMEOUT_MS);
      const timeoutPromise = new Promise((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('GPU task timed out', 'TimeoutError'))
        )
      );

      const result = await Promise.race([entry.taskFn(), timeoutPromise]);
      entry.resolve(result);
    } catch (err) {
      console.error(`[GPUScheduler] ${entry.type} task failed:`, err);
      entry.reject(err);
    } finally {
      const endMs = Date.now();
      _auditLog.push({ type: entry.type, startMs, endMs });
      if (_auditLog.length > AUDIT_SIZE) _auditLog.shift();
      _activeTask = null;
    }

    // Drain next task if queue not empty
    if (_queue.length > 0) _drainQueue();
  }).catch(() => {}); // prevent tail breakage
}
```

### Wiring in sidebar.js (encoder side)
```javascript
// Replace direct scheduleEncode call with scheduler-wrapped version
import { scheduleGpuTask } from './modules/gpu-scheduler.js';

// In initEncoderOnStartup(), after encoder is ready:
if (encoderReady) {
  scheduleEncode(messages, (batch, embeddings) => {
    console.log(`[Encoder] Batch encoded: ${batch.length} messages`);
  });
}

// Encoder wrapper — passes through the GPU scheduler
function encoderTask(messages, onBatchReady) {
  return scheduleGpuTask('encoder', 1, () =>
    encodeMessages(messages).then(embeddings => {
      if (onBatchReady && embeddings) onBatchReady(messages, embeddings);
    })
  );
}
```

### Listening for gpu-unavailable (encoder-adapter.js)
```javascript
// Source: MDN CustomEvent + dispatchEvent
window.addEventListener('gpu-unavailable', (event) => {
  console.warn('[Encoder] GPU unavailable, switching to WASM:', event.detail);
  backendUsed = 'wasm';
  // Re-init encoder with WASM backend
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setTimeout`-based timeout cleanup | `AbortSignal.timeout()` static method | Chrome 103 / Firefox 100 / Safari 15.4 (2022) | Single-line timeout with auto-cleanup, no manual clearTimeout needed |
| `Promise.race([p, new Promise(r => setTimeout(r, ms))])` | `AbortSignal.timeout()` + race | 2022 | Old approach leaks the timeout if task finishes first |
| Polling `isLocked()` to check mutex state | `waitForUnlock()` or chain directly | N/A | Polling burns cycles; promise chaining is zero-overhead |

**Deprecated/outdated:**
- Manual `release()` in try/catch: use `runExclusive()` (async-mutex) or the promise-chain pattern which has no explicit release step and therefore cannot deadlock from a missed release.

---

## Open Questions

1. **Does ONNX Runtime Web internally serialize GPU command submissions?**
   - What we know: ONNX Runtime Web WebGPU EP creates a `GPUDevice` and submits compute pipelines per-inference. No official documentation addresses concurrent session behavior.
   - What's unclear: Whether two simultaneous `session.run()` calls on the same device would fail, produce garbage, or serialize internally.
   - Recommendation: Treat this as unknown and rely on the scheduler as the sole serialization layer. This is the conservative and correct choice regardless of ONNX behavior.
   - Confidence: LOW (no verified source)

2. **Does `AbortSignal.timeout()` actually interrupt a hung WebGPU compute shader?**
   - What we know: `AbortSignal.timeout()` resolves the JS-side race, but the GPU pipeline continues until the driver reclaims it.
   - What's unclear: Whether an in-progress `session.run()` that is "won" by the timeout will hold the GPU device locked, causing the next task to fail immediately.
   - Recommendation: On timeout, log an error and dispatch 'gpu-unavailable'. Do not attempt to start a new GPU task after a timeout without first attempting `device.destroy()` and re-requesting. For now, treat timeout as a "GPU state unknown" condition and let the device-loss watcher handle cleanup.
   - Confidence: MEDIUM (reasoning from WebGPU device-loss docs, not confirmed empirically)

3. **Does `encoder-adapter.js` currently call `scheduleEncode()` directly, or does it already abstract the GPU call?**
   - What we know: `encoder-adapter.js` calls `encoderPipeline(texts, ...)` directly inside `encodeMessages()`. `sidebar.js` calls `scheduleEncode()` which calls `flushQueue()` which calls `encodeMessages()`.
   - What's unclear: The scheduler should wrap `encodeMessages()` at which layer? Wrapping at `encodeMessages()` is cleanest (GPU work is isolated there). Wrapping at `scheduleEncode()` avoids touching `encoder-adapter.js`.
   - Recommendation: Wrap at the `encodeMessages()` level inside `encoder-adapter.js`. Export a new `scheduleEncodedMessages()` that routes through `gpu-scheduler.js`. This keeps the GPU boundary explicit and testable.
   - Confidence: HIGH (based on code inspection of encoder-adapter.js)

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs: GPUDevice.lost — https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost
- MDN Web Docs: GPUDeviceLostInfo — https://developer.mozilla.org/en-US/docs/Web/API/GPUDeviceLostInfo
- MDN Web Docs: AbortSignal.timeout() — implicit from AbortController search results
- toji.dev WebGPU Device Loss Best Practices — https://toji.dev/webgpu-best-practices/device-loss.html
- Transformers.js WebGPU guide — https://huggingface.co/docs/transformers.js/guides/webgpu
- ONNX Runtime Web WebGPU EP docs — https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html

### Secondary (MEDIUM confidence)
- async-mutex GitHub README — https://github.com/DirtyHairy/async-mutex (confirms Semaphore supports priority; confirms browser-compatible)
- blog.mayflower.de promise-chain mutex explanation — https://blog.mayflower.de/6369-javascript-mutex-synchronizing-async-operations.html
- ori88c/starvation-free-priority-queue — https://github.com/ori88c/starvation-free-priority-queue (confirms starvation-prevention algorithms exist; Claude's approach is simpler)

### Tertiary (LOW confidence)
- ONNX Runtime Web concurrent session behavior — no authoritative source found; assumption based on absence of documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — promise-chain mutex is a foundational JS pattern; no library needed
- Architecture: HIGH — WebGPU device loss API is well-documented on MDN and toji.dev; queue/priority patterns are standard
- Pitfalls: HIGH — promise chain breakage and device.lost misuse are verified gotchas from official docs
- ONNX concurrent session behavior: LOW — no official documentation found

**Research date:** 2026-02-20
**Valid until:** 2026-05-20 (WebGPU APIs are stable; Transformers.js v3 API is stable for this use case)
