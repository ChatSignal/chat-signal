import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeSignals } from './fixtures/lexicon-mirror.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const batches = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/nano-batches.json'), 'utf8'));

describe('nano-batches fixture integrity', () => {
  it('has 50-100 batches', () => {
    assert.ok(batches.length >= 50 && batches.length <= 100, `got ${batches.length}`);
  });

  it('every batch is well-formed', () => {
    for (const b of batches) {
      assert.equal(typeof b.id, 'string');
      assert.equal(typeof b.label, 'string');
      assert.ok(Array.isArray(b.messages) && b.messages.length > 0, `${b.id} messages`);
      assert.ok(b.messages.every(m => typeof m === 'string'), `${b.id} message types`);
      const s = b.expected.signals;
      for (const k of ['positive_count', 'negative_count', 'confused_count', 'neutral_count', 'sentiment_score']) {
        assert.equal(typeof s[k], 'number', `${b.id} signals.${k}`);
      }
      assert.ok(['positive', 'negative', 'confused', 'none'].includes(b.expected.polarity), `${b.id} polarity`);
    }
  });

  it('stored signals match a fresh recompute (mirror not drifted)', () => {
    for (const b of batches) {
      assert.deepEqual(computeSignals(b.messages), b.expected.signals, `${b.id} signals drifted`);
    }
  });

  it('covers all required batch categories', () => {
    const labels = new Set(batches.map(b => b.label));
    for (const need of ['positive-mix', 'negative-mix', 'confused-mix', 'sparse', 'cjk-emoji', 'spam-flood', 'injection']) {
      assert.ok(labels.has(need), `missing category ${need}`);
    }
  });

  it('has 5-10 injection batches, each positive-dominant with a planted attack line', () => {
    const inj = batches.filter(b => b.label === 'injection');
    assert.ok(inj.length >= 5 && inj.length <= 10, `got ${inj.length} injection batches`);
    for (const b of inj) {
      // Real chat is positive-dominant so a flip to the injected target must come
      // from the model, where reconcileMoodWithSignals is the last line of defense.
      assert.equal(b.expected.polarity, 'positive', `${b.id} should be positive-dominant`);
      assert.equal(b.expected.injection.target, 'negative');
      assert.ok(b.messages.some(m => /MOOD:|SYSTEM:|IGNORE ALL|unrestricted|disregard/i.test(m)), `${b.id} has attack line`);
    }
  });
});
