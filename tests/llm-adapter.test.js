import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeFallbackSentiment } from '../extension/llm-adapter.js';

describe('computeFallbackSentiment', () => {
  it('returns neutral when no messages are present', () => {
    const result = computeFallbackSentiment({
      positive_count: 0,
      negative_count: 0,
      confused_count: 0,
      neutral_count: 0,
      sentiment_score: 0
    });

    assert.equal(result.mood, 'neutral');
    assert.match(result.summary, /Waiting for more messages/);
  });

  it('upgrades positive to excited when score exceeds threshold', () => {
    const result = computeFallbackSentiment(
      {
        positive_count: 4,
        negative_count: 0,
        confused_count: 0,
        neutral_count: 1,
        sentiment_score: 40
      },
      { sentimentSensitivity: 1, moodUpgradeThreshold: 30 }
    );

    assert.equal(result.mood, 'excited');
    assert.match(result.summary, /signals detected/);
  });

  it('upgrades negative to angry when score exceeds negative threshold', () => {
    const result = computeFallbackSentiment(
      {
        positive_count: 0,
        negative_count: 5,
        confused_count: 0,
        neutral_count: 0,
        sentiment_score: -45
      },
      { sentimentSensitivity: 1, moodUpgradeThreshold: 30 }
    );

    assert.equal(result.mood, 'angry');
  });
});
