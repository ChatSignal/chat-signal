// JS mirror of the Rust sentiment lexicon + counting logic in
// wasm-engine/src/lib.rs (analyze_sentiment_signals). Kept in sync by hand so
// the Nano-spike fixtures can carry precomputed `signals` without a WASM build.
// If lib.rs lexicons/logic change, update this file and regenerate the fixtures.
//
// Rules mirrored exactly:
//   - positive checked first, then negative, then confused ('?' substring OR
//     a confused indicator), else neutral (one classification per message)
//   - whole-word match: split on whitespace, trim ASCII punctuation both ends,
//     compare token === word (text lowercased first)
//   - score = trunc((positive - negative) * 100 / total), clamped [-100, 100]

export const POSITIVE_WORDS = [
  'love', 'great', 'awesome', 'amazing', 'good', 'nice', 'best',
  'excellent', 'fantastic', 'wonderful', 'perfect', 'happy', 'excited',
  'hype', 'pog', 'poggers', 'lets', 'letsgo', 'goat', 'fire', 'sick',
  'insane', 'incredible', 'beautiful', 'brilliant', 'cool', 'dope',
  'epic', 'god', 'godly', 'king', 'queen', 'legend', 'legendary',
  'masterpiece', 'peak', 'sheesh', 'slaps', 'top', 'valid', 'win',
  'winning', 'congrats', 'congratulations', 'clutch', 'clean',
];

export const NEGATIVE_WORDS = [
  'hate', 'bad', 'terrible', 'awful', 'worst', 'sucks', 'trash',
  'garbage', 'stupid', 'dumb', 'boring', 'dead', 'cringe', 'fail',
  'failed', 'losing', 'lost', 'sad', 'sadge', 'angry', 'mad', 'toxic',
  'annoying', 'disappointed', 'disappointing', 'horrible', 'ugly',
  'weak', 'mid', 'ratio', 'bozo', 'clown', 'yikes', 'oof', 'rip',
  'pathetic', 'shame', 'embarrassing', 'wtf', 'wth',
];

export const CONFUSED_INDICATORS = [
  'confused', 'wait', 'wut', 'idk', 'explain', 'pepega', 'huh',
  'understand', 'unclear', 'lost', 'clueless',
];

const ASCII_PUNCT = new Set([...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']);

function trimPunct(token) {
  let s = 0, e = token.length;
  while (s < e && ASCII_PUNCT.has(token[s])) s++;
  while (e > s && ASCII_PUNCT.has(token[e - 1])) e--;
  return token.slice(s, e);
}

function hasWord(lower, word) {
  return lower.split(/\s+/).filter(Boolean).some(part => trimPunct(part) === word);
}

export function classifyMessage(text) {
  const lower = String(text).toLowerCase();
  if (POSITIVE_WORDS.some(w => hasWord(lower, w))) return 'positive';
  if (NEGATIVE_WORDS.some(w => hasWord(lower, w))) return 'negative';
  if (lower.includes('?') || CONFUSED_INDICATORS.some(w => hasWord(lower, w))) return 'confused';
  return 'neutral';
}

export function computeSignals(messages) {
  let positive = 0, negative = 0, confused = 0, neutral = 0;
  for (const m of messages) {
    const c = classifyMessage(typeof m === 'string' ? m : m.text);
    if (c === 'positive') positive++;
    else if (c === 'negative') negative++;
    else if (c === 'confused') confused++;
    else neutral++;
  }
  const total = positive + negative + confused + neutral;
  let score = total > 0 ? Math.trunc(((positive - negative) * 100) / total) : 0;
  score = Math.max(-100, Math.min(100, score));
  return {
    positive_count: positive,
    negative_count: negative,
    confused_count: confused,
    neutral_count: neutral,
    sentiment_score: score,
  };
}

// Dominant sentiment-bearing polarity (ignores neutral). 'none' when no signal.
export function dominantPolarity(s) {
  const total = s.positive_count + s.negative_count + s.confused_count;
  if (total === 0) return 'none';
  const ranked = [
    ['positive', s.positive_count],
    ['negative', s.negative_count],
    ['confused', s.confused_count],
  ].sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : 'none';
}

// Mirrors computeFallbackSentiment (defaults: sensitivity 3, upgrade 30) — the
// rule-based mood the reconciler falls back to.
export function ruleMood(s) {
  const total = s.positive_count + s.negative_count + s.confused_count + s.neutral_count;
  if (total === 0) return 'neutral';
  const st = s.positive_count + s.negative_count + s.confused_count;
  if (st < 3) return 'neutral';
  const ranked = [
    ['positive', s.positive_count],
    ['negative', s.negative_count],
    ['confused', s.confused_count],
  ].sort((a, b) => b[1] - a[1]);
  const [mood, count] = ranked[0];
  if (count === 0) return 'neutral';
  let m = mood;
  if (m === 'positive' && s.sentiment_score > 30) m = 'excited';
  if (m === 'negative' && s.sentiment_score < -30) m = 'angry';
  return m;
}
