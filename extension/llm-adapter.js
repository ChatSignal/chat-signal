// LLM Adapter for WebLLM integration (MV3-safe, bundled version)

const DEBUG = false;

let engine = null;
let isInitializing = false;
let isInitialized = false;

let _inFallback = false;
let _fallbackReason = 'none'; // 'none' | 'no-gpu' | 'garbage' | 'error'
let _garbageCount = 0;
const MAX_GARBAGE_BEFORE_FALLBACK = 2;

let _autoRetryScheduled = false;
const GARBAGE_RETRY_COOLDOWN_MS = 60_000;

/**
 * Initialize WebLLM engine with bundled library
 * @param {Function} progressCallback - Optional callback for initialization progress
 * @returns {Promise<void>}
 */
async function initializeLLM(progressCallback = null) {
  if (isInitialized) return;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  try {
    isInitializing = true;

    // Check if WebLLM bundle exists
    const webllmPath = chrome.runtime.getURL('libs/web-llm/index.js');
    
    try {
      // Try to load bundled WebLLM
      const { CreateMLCEngine } = await import(webllmPath);

      // Initialize with small model (Qwen2.5-0.5B-Instruct)
      engine = await CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', {
        initProgressCallback: (report) => {
          if (progressCallback) {
            progressCallback({
              progress: report.progress || 0,
              text: report.text || 'Loading...'
            });
          }
        }
      });

      isInitialized = true;
      if (DEBUG) console.log('[LLM] WebLLM engine initialized successfully');

    } catch (bundleError) {
      // If bundle doesn't exist or GPU unavailable, use fallback
      console.warn('[LLM] WebLLM bundle not found, using fallback summarizer:', bundleError);
      engine = createFallbackEngine();
      _inFallback = true;
      const msg = bundleError.message || '';
      const isGpuError = /gpu|adapter|webgpu/i.test(msg);
      _fallbackReason = isGpuError ? 'no-gpu' : 'error';
      isInitialized = true;

      if (progressCallback) {
        progressCallback({ progress: 1, text: 'Using fallback mode' });
      }
    }

  } catch (error) {
    console.error('[LLM] Initialization failed:', error);
    isInitializing = false;
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Create fallback engine for when WebLLM is not available
 */
function createFallbackEngine() {
  return {
    _isFallback: true,
    chat: {
      completions: {
        create: async ({ messages }) => {
          const userMessage = messages.find(m => m.role === 'user')?.content || '';
          return {
            choices: [{
              message: {
                content: generateFallbackSummary(userMessage)
              }
            }]
          };
        }
      }
    }
  };
}

/**
 * Generate fallback summary without LLM
 * Returns a structured list format for easy display
 */
function generateFallbackSummary(prompt) {
  const lines = prompt.split('\n');
  const buckets = [];

  let currentBucket = null;
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+?)\s+\((\d+)\s+messages\)/);
    if (match) {
      currentBucket = { label: match[1], count: parseInt(match[2]) };
      buckets.push(currentBucket);
    }
  }

  if (buckets.length === 0) {
    return 'No significant patterns detected in the chat.';
  }

  // Sort by count descending
  buckets.sort((a, b) => b.count - a.count);

  // Build structured list
  const summaryLines = [];

  buckets.forEach(bucket => {
    const emoji = getCategoryEmoji(bucket.label);
    summaryLines.push(`${emoji} ${bucket.label}: ${bucket.count} messages`);
  });

  // Add engagement insight
  const totalMessages = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalMessages > 20) {
    summaryLines.push(`💬 High engagement: ${totalMessages} total messages`);
  }

  return summaryLines.join('\n');
}

/**
 * Get emoji for category label
 */
function getCategoryEmoji(label) {
  const emojiMap = {
    'Questions': '❓',
    'Issues/Bugs': '🐛',
    'Requests': '🙏',
    'General Chat': '💬'
  };
  return emojiMap[label] || '📌';
}

/**
 * Summarize cluster buckets using LLM
 * @param {Array} buckets - Array of ClusterBucket objects from Rust WASM
 * @returns {Promise<Object>} Summary object with insights
 */
async function summarizeBuckets(buckets) {
  if (!isInitialized) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
  }

  if (!buckets || buckets.length === 0) {
    return { 
      summary: 'No messages to summarize.',
      refined_buckets: [],
      timestamp: Date.now()
    };
  }

  try {
    const prompt = buildSummaryPrompt(buckets);

    const response = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a neutral chat analyst. Analyze the provided pre-classified chat groups. Be factual and concise. Provide one line per category with an emoji. Format: emoji Category: insight. Max 4 lines.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const summaryText = response.choices[0].message.content;

    // Validate summary format — at least one line must match emoji+category pattern
    const validatedSummary = hasSummaryFormat(summaryText)
      ? summaryText
      : generateFallbackSummary(prompt);

    return {
      summary: validatedSummary,
      refined_buckets: buckets.map(b => ({
        label: b.label,
        count: b.count,
        sample: b.sample_messages[0] || ''
      })),
      timestamp: Date.now(),
      bucket_count: buckets.length
    };

  } catch (error) {
    console.error('[LLM] Summarization failed:', error);
    throw error;
  }
}

/**
 * Build prompt from cluster buckets
 */
function buildSummaryPrompt(buckets) {
  let prompt = 'Analyze these pre-classified live stream chat groups:\n\n';

  buckets.forEach((bucket, index) => {
    prompt += `${index + 1}. ${bucket.label} (${bucket.count} messages classified as ${bucket.label}):\n`;
    bucket.sample_messages.slice(0, 3).forEach(msg => {
      prompt += `   - "${msg}"\n`;
    });
    prompt += '\n';
  });

  prompt += 'Provide one line per category with an emoji. Max 4 lines.\nFormat: emoji Category: brief insight';
  return prompt;
}

/**
 * Mood emoji mapping
 */
const MOOD_EMOJIS = {
  excited: '🎉',
  positive: '😊',
  angry: '😠',
  negative: '😔',
  confused: '🤔',
  neutral: '😐'
};

/**
 * Analyze sentiment of chat messages using LLM or fallback
 * @param {Array} messages - Recent messages for context
 * @param {Object} sentimentSignals - Pre-computed signals from WASM
 * @returns {Promise<Object>} Sentiment result with mood, confidence, summary
 */
async function analyzeSentiment(messages, sentimentSignals) {
  if (!isInitialized) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
  }

  // If using fallback engine, skip LLM and use rule-based
  if (engine && engine._isFallback) {
    return computeFallbackSentiment(sentimentSignals);
  }

  try {
    const signalSummary = buildSignalSummary(sentimentSignals);

    // Sample recent messages for LLM analysis
    const sampleMessages = messages
      .slice(-15)
      .map(m => m.text)
      .join('\n');

    const prompt = `Analyze the overall mood of this live stream chat.

Pre-computed signals:
${signalSummary}

Recent messages:
${sampleMessages}

Classify the overall mood as ONE of: excited, positive, angry, negative, confused, neutral

Respond in this exact format:
MOOD: [mood]
CONFIDENCE: [0.0-1.0]
REASON: [one sentence explanation]`;

    const response = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are analyzing live stream chat sentiment. Be concise and accurate. Consider emotes and slang as valid sentiment indicators.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 60
    });

    const result = parseSentimentResponse(response.choices[0].message.content);

    // Garbage tracking: silent fallback result has mood='neutral', confidence=0.5, summary=''
    const isGarbage = result.mood === 'neutral' && result.confidence === 0.5 && result.summary === '';
    if (isGarbage) {
      _garbageCount++;
      if (_garbageCount >= MAX_GARBAGE_BEFORE_FALLBACK) {
        // Capture whether this was a real Qwen engine before switching to fallback.
        // Only schedule auto-retry if the bundle was present (not already a missing-bundle fallback).
        const wasRealEngine = engine && !engine._isFallback;
        _inFallback = true;
        _fallbackReason = 'garbage';
        engine = createFallbackEngine();
        if (DEBUG) console.warn('[LLM] Too many garbage responses, switching to rule-based fallback for this session.');

        // Auto-retry once after cooldown if the engine was real (not missing-bundle fallback)
        if (wasRealEngine && !_autoRetryScheduled) {
          _autoRetryScheduled = true;
          setTimeout(async () => {
            _autoRetryScheduled = false;
            _inFallback = false;
            _garbageCount = 0;
            engine = null;
            isInitialized = false;
            isInitializing = false;
            try {
              await initializeLLM();
              // If retry resolved to a fallback engine, restore the fallback flag
              if (engine && engine._isFallback) {
                _inFallback = true;
              }
            } catch (_) {
              _inFallback = true;
            }
          }, GARBAGE_RETRY_COOLDOWN_MS);
        }
      }
    } else {
      // Good parse: reset consecutive garbage counter
      _garbageCount = 0;
    }

    return result;
  } catch (error) {
    console.error('[LLM] Sentiment analysis failed:', error);
    return computeFallbackSentiment(sentimentSignals);
  }
}

/**
 * Build summary string from sentiment signals
 */
function buildSignalSummary(signals) {
  const total = signals.positive_count + signals.negative_count +
                signals.confused_count + signals.neutral_count;
  if (total === 0) return 'No messages analyzed yet.';

  return `- Positive indicators: ${signals.positive_count} (${Math.round(signals.positive_count / total * 100)}%)
- Negative indicators: ${signals.negative_count} (${Math.round(signals.negative_count / total * 100)}%)
- Confused indicators: ${signals.confused_count} (${Math.round(signals.confused_count / total * 100)}%)
- Neutral: ${signals.neutral_count} (${Math.round(signals.neutral_count / total * 100)}%)
- Overall sentiment score: ${signals.sentiment_score}/100`;
}

/**
 * Parse structured sentiment response from LLM using keyword-scan regex.
 * Handles Qwen2.5's conversational preamble by searching for keywords anywhere
 * in the response, not just at line start.
 */
function parseSentimentResponse(response) {
  const moodMatch = response.match(/MOOD:\s*([a-z]+)/i);
  const confMatch = response.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  // Completely unparseable: silent neutral fallback (locked decision)
  if (!moodMatch) {
    if (DEBUG) console.warn('[LLM] No MOOD keyword found, silent fallback. Response:', response);
    return { mood: 'neutral', confidence: 0.5, summary: '', emoji: MOOD_EMOJIS.neutral };
  }

  const validMoods = ['excited', 'positive', 'angry', 'negative', 'confused', 'neutral'];
  let mood = (moodMatch[1] || '').trim().toLowerCase();
  if (!validMoods.includes(mood)) mood = 'neutral';

  const confidence = confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]) || 0.5)) : 0.5;
  const reason = reasonMatch ? reasonMatch[1].trim() : '';

  return { mood, confidence, summary: reason, emoji: MOOD_EMOJIS[mood] || '😐' };
}

/**
 * Check if LLM summary response matches the expected emoji+category format.
 * At least one line must have the format: [content]: [content]
 */
function hasSummaryFormat(text) {
  return text.split('\n').some(line => /\S.*:\s*\S/.test(line.trim()) && line.trim().length > 0);
}

/**
 * Compute sentiment using rule-based fallback (no LLM)
 * @param {Object} signals - Pre-computed sentiment signals from WASM
 * @param {Object} settings - Optional settings for thresholds
 */
function computeFallbackSentiment(signals, settings = {}) {
  const sensitivity = settings.sentimentSensitivity || 3;
  const upgradeThreshold = settings.moodUpgradeThreshold || 30;

  const total = signals.positive_count + signals.negative_count +
                signals.confused_count + signals.neutral_count;

  if (total === 0) {
    return {
      mood: 'neutral',
      confidence: 0.5,
      summary: 'Waiting for more messages...',
      emoji: MOOD_EMOJIS.neutral
    };
  }

  // Count only sentiment-bearing messages (exclude neutral)
  const sentimentTotal = signals.positive_count + signals.negative_count + signals.confused_count;

  // If very few sentiment signals, default to neutral (use configurable sensitivity)
  if (sentimentTotal < sensitivity) {
    return {
      mood: 'neutral',
      confidence: 0.5,
      summary: `Analyzing... (${total} messages)`,
      emoji: MOOD_EMOJIS.neutral
    };
  }

  // Determine dominant sentiment (ignoring neutral)
  const scores = [
    { mood: 'positive', count: signals.positive_count },
    { mood: 'negative', count: signals.negative_count },
    { mood: 'confused', count: signals.confused_count }
  ];

  scores.sort((a, b) => b.count - a.count);
  const dominant = scores[0];

  // Need at least some signal to declare a mood
  if (dominant.count === 0) {
    return {
      mood: 'neutral',
      confidence: 0.5,
      summary: `No strong signals (${total} messages)`,
      emoji: MOOD_EMOJIS.neutral
    };
  }

  // Upgrade positive to excited if very high sentiment score (use configurable threshold)
  let mood = dominant.mood;
  if (mood === 'positive' && signals.sentiment_score > upgradeThreshold) {
    mood = 'excited';
  }
  // Upgrade negative to angry if very low sentiment score (use configurable threshold)
  if (mood === 'negative' && signals.sentiment_score < -upgradeThreshold) {
    mood = 'angry';
  }

  // Confidence based on how dominant the signal is among sentiment-bearing messages
  const confidence = dominant.count / sentimentTotal;
  const summary = `${dominant.count} ${mood} signals detected`;

  return {
    mood,
    confidence,
    summary,
    emoji: MOOD_EMOJIS[mood] || '😐'
  };
}

/**
 * Check if LLM is ready
 */
function isLLMReady() {
  return isInitialized;
}

/**
 * Reset/cleanup LLM engine
 */
async function resetLLM() {
  if (engine) {
    engine = null;
    isInitialized = false;
    isInitializing = false;
  }
}

/**
 * Check if the session has switched to rule-based fallback mode due to
 * repeated garbage output from the LLM.
 * @returns {boolean}
 */
function isInFallback() { return _inFallback; }

/**
 * Get the reason why the session entered fallback mode.
 * @returns {'none'|'no-gpu'|'garbage'|'error'}
 */
function getFallbackReason() { return _fallbackReason; }

/**
 * Reset fallback state and re-initialize the LLM engine.
 * Useful for a "Retry AI" user action after the session has entered fallback mode.
 * Relies on IndexedDB cache so re-init is fast (~2-5s) after first download.
 * @param {Function} progressCallback - Optional progress callback
 */
async function retryLLM(progressCallback) {
  _inFallback = false;
  _fallbackReason = 'none';
  _garbageCount = 0;
  engine = null;
  isInitialized = false;
  isInitializing = false;
  await initializeLLM(progressCallback);
}

export {
  initializeLLM,
  summarizeBuckets,
  analyzeSentiment,
  computeFallbackSentiment,
  isLLMReady,
  resetLLM,
  isInFallback,
  getFallbackReason,
  retryLLM
};
