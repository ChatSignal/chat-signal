// GPU Scheduler — serializes all WebGPU access between encoder (MiniLM) and SLM (Qwen)
// Prevents concurrent WebGPU device access via a promise-chain mutex with priority ordering,
// starvation prevention, timeout enforcement, and device-loss detection.
//
// Usage:
//   import { scheduleGpuTask, getStatus, registerDevice } from './modules/gpu-scheduler.js';
//
// Consumers:
//   encoder-adapter.js  — type='encoder', priority=1
//   llm-adapter.js      — type='slm',     priority=2  (Phase 11)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_QUEUE_DEPTH = 8;       // Drop-oldest when exceeded (mid-range of locked 5-10 range)
const GPU_TIMEOUT_MS = 30_000;   // 30-second hard timeout per GPU task (locked)
const ENCODER_BURST_LIMIT = 4;   // After 4 consecutive encoder runs, force one SLM slot
const AUDIT_SIZE = 20;           // Ring buffer size for non-overlapping verification

// ---------------------------------------------------------------------------
// Module-level state (private)
// ---------------------------------------------------------------------------

let _tail = Promise.resolve();  // promise-chain root — each task chains off this
let _queue = [];                // pending task entries { type, priority, taskFn, resolve, reject }
let _activeTask = null;         // currently executing task descriptor (or null)
let _gpuAvailable = true;       // flipped to false on permanent device loss
let _consecutiveEncoderRuns = 0; // burst counter for starvation prevention
const _auditLog = [];           // circular buffer of { type, startMs, endMs }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule a GPU task for serial execution.
 *
 * @param {string} type      — Task type: 'encoder' | 'slm'
 * @param {number} priority  — Lower number = higher priority (encoder=1, slm=2)
 * @param {Function} taskFn  — Async function that performs GPU work; called with no arguments
 * @returns {Promise}        — Resolves with taskFn result, rejects on error/timeout/gpu-unavailable
 */
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

/**
 * Return current scheduler status for external inspection.
 * All values have safe zero-state defaults so callers never crash on a fresh scheduler.
 *
 * @returns {{ queueDepth: number, activeTask: {type: string}|null, auditLog: Array, gpuAvailable: boolean }}
 */
function getStatus() {
  return {
    queueDepth: _queue.length,
    activeTask: _activeTask ? { type: _activeTask.type } : null,
    auditLog: [..._auditLog],
    gpuAvailable: _gpuAvailable,
  };
}

/**
 * Register a WebGPU device for loss detection.
 * Attaches a .then() handler to device.lost — do NOT await this.
 * When device is permanently lost, sets _gpuAvailable=false and dispatches 'gpu-unavailable'.
 *
 * @param {GPUDevice} device — The WebGPU device to watch
 */
function registerDevice(device) {
  // Do NOT await — device.lost never resolves during normal operation (Pitfall 2 from research)
  device.lost.then((info) => {
    console.error(`[GPUScheduler] WebGPU device lost: ${info.message}`);

    // 'destroyed' = intentional cleanup (our own device.destroy() call), not a fault
    if (info.reason !== 'destroyed') {
      _gpuAvailable = false;
      window.dispatchEvent(new CustomEvent('gpu-unavailable', {
        detail: { reason: info.reason, message: info.message },
      }));
    }
  });
}

export { scheduleGpuTask, getStatus, registerDevice };

// ---------------------------------------------------------------------------
// Internal functions
// ---------------------------------------------------------------------------

/**
 * Add an entry to the queue, dropping the oldest same-type entry if at capacity.
 * Drop-oldest policy: stale encoder batches are superseded by fresh chat data.
 *
 * @param {{ type, priority, taskFn, resolve, reject }} entry
 */
function _addToQueue(entry) {
  if (_queue.length >= MAX_QUEUE_DEPTH) {
    // Prefer dropping oldest task of the same type (stale data)
    const sameTypeIdx = _queue.findIndex(t => t.type === entry.type);
    const dropIdx = sameTypeIdx !== -1 ? sameTypeIdx : 0; // fallback: oldest overall
    const dropped = _queue.splice(dropIdx, 1)[0];
    console.log(`[GPUScheduler] Dropped stale ${dropped.type} task (queue full)`);
    dropped.reject(new Error('task-dropped'));
  }
  _queue.push(entry);
}

/**
 * Select the index of the next task to execute.
 * Applies weighted-slot fairness: after ENCODER_BURST_LIMIT consecutive encoder runs,
 * force one SLM slot to prevent starvation.
 *
 * @returns {number} Index in _queue, or -1 if queue is empty
 */
function _selectNext() {
  if (_queue.length === 0) return -1;

  const hasSLM = _queue.some(t => t.type === 'slm');
  const forceSLM = hasSLM && _consecutiveEncoderRuns >= ENCODER_BURST_LIMIT;

  if (forceSLM) {
    // SLM starvation prevention — give SLM a guaranteed slot
    _consecutiveEncoderRuns = 0;
    return _queue.findIndex(t => t.type === 'slm');
  }

  // Normal priority ordering: encoder (priority 1) before SLM (priority 2)
  const encoderIdx = _queue.findIndex(t => t.priority === 1);
  if (encoderIdx !== -1) {
    _consecutiveEncoderRuns++;
    return encoderIdx;
  }

  // No encoder tasks — run next SLM task
  _consecutiveEncoderRuns = 0;
  return 0;
}

/**
 * Chain the next task execution off _tail (the promise-chain mutex).
 * Sets _tail to the new chain so subsequent calls serialize correctly.
 * The .catch(() => {}) on _tail prevents chain breakage on task errors (Pitfall 1).
 */
function _drainQueue() {
  _tail = _tail.then(async () => {
    const idx = _selectNext();
    if (idx === -1) return;

    const entry = _queue.splice(idx, 1)[0];
    _activeTask = entry;
    const startMs = Date.now();

    try {
      // AbortSignal.timeout() is cleaner than Promise.race + setTimeout (auto-cleanup)
      const signal = AbortSignal.timeout(GPU_TIMEOUT_MS);
      const timeoutPromise = new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('GPU task timed out after 30s', 'TimeoutError'))
        );
      });

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

    // Drain next queued task if any arrived while this one was running
    if (_queue.length > 0) _drainQueue();
  }).catch(() => {}); // prevent _tail breakage if task rejects (Pitfall 1 from research)
}
