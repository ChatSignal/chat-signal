import { describe, expect, it } from 'vitest';

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

    expect(result.mood).toBe('neutral');
    expect(result.summary).toContain('Waiting for more messages');
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

    expect(result.mood).toBe('excited');
    expect(result.summary).toContain('signals detected');
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

    expect(result.mood).toBe('angry');
  });
});
