// cosine-router.js
// Standalone cosine similarity routing module.
// No DOM access, no chrome APIs — pure math + encoder calls.
//
// Classifies messages into 4 fixed buckets (Questions, Issues/Bugs, Requests,
// General Chat) using cosine similarity against pre-computed prototype vectors.
// Prototype vectors are centroids of seed phrase embeddings from routing-config.js.
//
// Because embeddings from encodeMessages() are already L2-normalized (normalize: true
// in the Transformers.js pipeline call), cosine similarity = dot product. No library needed.

import { encodeMessages } from './encoder-adapter.js';
import { ROUTING_CONFIG } from './routing-config.js';

// ---------------------------------------------------------------------------
// Module-level state (session-scoped, not persisted)
// ---------------------------------------------------------------------------

let _prototypeVectors = null; // Map<string, number[]> — label -> 384-dim normalized centroid
let _mode = 'keyword';        // 'semantic' | 'keyword'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build prototype vectors from seed phrases.
 * Encodes all seed phrases in a single batch, groups by category, computes
 * L2-normalized centroid per category, and stores in _prototypeVectors.
 *
 * Must be called after the encoder is ready (encodeMessages returns non-null).
 *
 * @returns {Promise<void>}
 */
async function buildPrototypes() {
  // Collect all seed phrases in category order so we can slice by index later
  const allSeeds = [];
  for (const category of ROUTING_CONFIG.categories) {
    for (const phrase of category.seedPhrases) {
      allSeeds.push({ text: phrase });
    }
  }

  // Single batch encode — reuses embeddingCache in encoder-adapter.js for hot paths
  const embeddings = await encodeMessages(allSeeds);
  if (!embeddings) {
    console.log('[CosineRouter] buildPrototypes failed — encodeMessages returned null');
    return;
  }

  _prototypeVectors = new Map();
  let idx = 0;

  for (const category of ROUTING_CONFIG.categories) {
    const count = category.seedPhrases.length;
    const categoryEmbeddings = embeddings.slice(idx, idx + count);
    // CRITICAL: L2-normalize centroid after averaging (Pitfall 1 guard).
    // The centroid of normalized vectors is NOT normalized — magnitude < 1.
    // Without re-normalization, dot products are not valid cosine similarities.
    _prototypeVectors.set(category.label, computeCentroid(categoryEmbeddings));
    idx += count;
  }

  console.log(
    '[CosineRouter] Prototypes built for',
    [..._prototypeVectors.keys()].join(', ')
  );
}

/**
 * Classify a single L2-normalized 384-dim embedding into a bucket label.
 *
 * Iterates ONLY non-General-Chat categories (Pitfall 4 guard).
 * If no category exceeds its threshold, returns ROUTING_CONFIG.defaultLabel.
 * Tie-breaking: highest similarity score wins (argmax).
 *
 * @param {number[]} embedding — L2-normalized 384-dim vector from encodeMessages()
 * @returns {string} bucket label string
 */
function classifyMessage(embedding) {
  if (!_prototypeVectors) {
    // Prototypes not built yet — caller should check isSemanticReady() before calling
    return ROUTING_CONFIG.defaultLabel;
  }

  let bestLabel = null;
  let bestScore = -Infinity;

  for (const category of ROUTING_CONFIG.categories) {
    const proto = _prototypeVectors.get(category.label);
    if (!proto) continue;

    // Dot product equals cosine similarity for L2-normalized vectors
    const score = dotProduct(embedding, proto);

    if (score > category.threshold && score > bestScore) {
      bestScore = score;
      bestLabel = category.label;
    }
  }

  // Below-threshold: no category won — route to default (General Chat)
  return bestLabel !== null ? bestLabel : ROUTING_CONFIG.defaultLabel;
}

/**
 * Classify an array of messages given their corresponding embeddings.
 *
 * @param {Array} messages — message objects (not used for classification, passed through for caller convenience)
 * @param {number[][]} embeddings — L2-normalized 384-dim vectors in same order as messages
 * @returns {string[]} array of bucket label strings
 */
function classifyBatch(messages, embeddings) {
  return embeddings.map(emb => classifyMessage(emb));
}

/**
 * Check if prototype vectors are built AND cosine mode is active.
 *
 * @returns {boolean}
 */
function isSemanticReady() {
  return _prototypeVectors !== null && _mode === 'semantic';
}

/**
 * Switch to semantic (cosine routing) mode.
 * Call after buildPrototypes() succeeds.
 */
function setSemanticMode() {
  _mode = 'semantic';
}

/**
 * Switch back to keyword mode.
 * Does NOT clear _prototypeVectors — if encoder recovers later, setSemanticMode()
 * re-enables cosine routing without needing to rebuild (prototypes remain valid).
 */
function setKeywordMode() {
  _mode = 'keyword';
}

/**
 * Get current routing mode string.
 * @returns {'semantic'|'keyword'}
 */
function getMode() {
  return _mode;
}

// ---------------------------------------------------------------------------
// Internal functions (not exported)
// ---------------------------------------------------------------------------

/**
 * Compute centroid (average) of an array of 384-dim vectors and L2-normalize it.
 * CRITICAL: The centroid of normalized vectors is NOT itself normalized.
 * Always call l2Normalize() on the centroid before storing as a prototype.
 *
 * @param {number[][]} vectors — array of 384-dim embedding arrays
 * @returns {number[]} L2-normalized centroid vector
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

  // L2-normalize so dot products against this centroid equal cosine similarity
  return l2Normalize(centroid);
}

/**
 * L2-normalize a vector in-place.
 * Guard for zero-norm (all-zero vector) — returns vector unchanged.
 *
 * @param {number[]} vec
 * @returns {number[]} the same array, normalized
 */
function l2Normalize(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec; // Guard: zero vector stays zero
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * Dot product of two equal-length arrays.
 * For L2-normalized vectors, this equals cosine similarity.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  buildPrototypes,
  classifyMessage,
  classifyBatch,
  isSemanticReady,
  setSemanticMode,
  setKeywordMode,
  getMode,
};
