import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { validateMessages, validateAnalysisResult, validateSettings } = await import(
  '../extension/sidebar/utils/ValidationHelpers.js'
);

describe('validateMessages', () => {
  it('accepts a valid message array', () => {
    const msgs = [
      { text: 'hello', author: 'user1', timestamp: 1712000000000 },
      { text: 'world', author: 'user2', timestamp: 1712000001000 }
    ];
    assert.equal(validateMessages(msgs), true);
  });

  it('rejects non-array input', () => {
    assert.throws(() => validateMessages('not an array'), /must be an array/);
  });

  it('rejects message with missing text', () => {
    assert.throws(() => validateMessages([{ author: 'a', timestamp: 1 }]), /text must be string/);
  });

  it('rejects message with text exceeding 1000 chars', () => {
    const long = 'x'.repeat(1001);
    assert.throws(() => validateMessages([{ text: long, timestamp: 1 }]), /text must be string/);
  });

  it('rejects message with non-positive timestamp', () => {
    assert.throws(() => validateMessages([{ text: 'hi', timestamp: 0 }]), /timestamp must be positive/);
  });

  it('rejects message with author exceeding 50 chars', () => {
    const longAuthor = 'a'.repeat(51);
    assert.throws(() => validateMessages([{ text: 'hi', author: longAuthor, timestamp: 1 }]), /author must be string/);
  });
});

describe('validateAnalysisResult', () => {
  const validResult = {
    buckets: [
      { label: 'Questions', count: 3, sample_messages: ['msg1', 'msg2'] }
    ],
    topics: [
      { term: 'test', count: 5, is_emote: false }
    ],
    sentiment_signals: {
      positive_count: 1,
      negative_count: 0,
      confused_count: 0,
      neutral_count: 2
    },
    processed_count: 3
  };

  it('accepts a valid analysis result', () => {
    assert.equal(validateAnalysisResult(validResult), true);
  });

  it('rejects null input', () => {
    assert.throws(() => validateAnalysisResult(null), /must be an object/);
  });

  it('rejects missing buckets', () => {
    assert.throws(() => validateAnalysisResult({ processed_count: 0 }), /buckets must be an array/);
  });

  it('rejects bucket with negative count', () => {
    assert.throws(() => validateAnalysisResult({
      buckets: [{ label: 'Q', count: -1, sample_messages: [] }],
      processed_count: 0
    }), /count must be a non-negative/);
  });

  it('rejects negative processed_count', () => {
    assert.throws(() => validateAnalysisResult({
      buckets: [],
      processed_count: -1
    }), /processed_count must be a non-negative/);
  });
});

describe('validateSettings', () => {
  const validSettings = {
    topicMinCount: 5,
    spamThreshold: 3,
    duplicateWindow: 30,
    sentimentSensitivity: 3,
    moodUpgradeThreshold: 30,
    aiSummariesEnabled: false,
    analysisWindowSize: 500,
    inactivityTimeout: 120
  };

  it('accepts valid DEFAULT_SETTINGS', () => {
    assert.equal(validateSettings(validSettings), true);
  });

  it('rejects topicMinCount out of range', () => {
    assert.throws(() => validateSettings({ ...validSettings, topicMinCount: 0 }), /topicMinCount/);
    assert.throws(() => validateSettings({ ...validSettings, topicMinCount: 101 }), /topicMinCount/);
  });

  it('rejects spamThreshold out of range', () => {
    assert.throws(() => validateSettings({ ...validSettings, spamThreshold: 0 }), /spamThreshold/);
  });

  it('rejects non-integer analysisWindowSize', () => {
    assert.throws(() => validateSettings({ ...validSettings, analysisWindowSize: 50.5 }), /analysisWindowSize/);
  });

  it('rejects non-boolean aiSummariesEnabled', () => {
    assert.throws(() => validateSettings({ ...validSettings, aiSummariesEnabled: 'yes' }), /aiSummariesEnabled/);
  });

  it('rejects non-object input', () => {
    assert.throws(() => validateSettings(null), /must be an object/);
  });
});
