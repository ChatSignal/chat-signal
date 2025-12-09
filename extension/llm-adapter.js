// LLM Adapter for WebLLM integration (MV3-safe, bundled version)

let engine = null;
let isInitializing = false;
let isInitialized = false;

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

      // Initialize with small model (Phi-2 or Llama-3.2-1B)
      engine = await CreateMLCEngine('Phi-2-q4f16_1-MLC', {
        initProgressCallback: (report) => {
          if (progressCallback) {
            progressCallback({
              progress: report.progress || 0,
              text: report.text || 'Loading...'
            });
          }
          console.log('[LLM] Loading:', report.text);
        },
        // Use extension storage for caching
        appConfig: {
          useIndexedDBCache: true
        }
      });

      isInitialized = true;
      console.log('[LLM] WebLLM engine initialized successfully');

    } catch (bundleError) {
      // If bundle doesn't exist, use fallback
      console.warn('[LLM] WebLLM bundle not found, using fallback summarizer:', bundleError);
      engine = createFallbackEngine();
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
  
  const topBucket = buckets.reduce((max, b) => b.count > max.count ? b : max, buckets[0]);
  let summary = `📊 Main focus: ${topBucket.label} (${topBucket.count} messages)`;
  
  if (buckets.length > 1) {
    const others = buckets.filter(b => b !== topBucket)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map(b => `${b.label} (${b.count})`)
      .join(', ');
    summary += `\n\nAlso active: ${others}`;
  }
  
  // Add engagement insight
  const totalMessages = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalMessages > 20) {
    summary += `\n\n💬 High engagement with ${totalMessages} messages analyzed.`;
  }
  
  return summary;
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
          content: 'You are analyzing live stream chat. Provide a concise 2-3 sentence summary highlighting key themes, questions, or concerns. Be specific and actionable.'
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

    return {
      summary: summaryText,
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
  let prompt = 'Analyze these chat message clusters:\n\n';

  buckets.forEach((bucket, index) => {
    prompt += `${index + 1}. ${bucket.label} (${bucket.count} messages):\n`;
    bucket.sample_messages.slice(0, 2).forEach(msg => {
      prompt += `   - "${msg}"\n`;
    });
    prompt += '\n';
  });

  prompt += 'Summary:';
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

    return parseSentimentResponse(response.choices[0].message.content);
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
 * Parse structured sentiment response from LLM
 */
function parseSentimentResponse(response) {
  const lines = response.split('\n');
  let mood = 'neutral';
  let confidence = 0.5;
  let reason = '';

  for (const line of lines) {
    if (line.toUpperCase().startsWith('MOOD:')) {
      mood = line.replace(/^MOOD:\s*/i, '').trim().toLowerCase();
    } else if (line.toUpperCase().startsWith('CONFIDENCE:')) {
      confidence = parseFloat(line.replace(/^CONFIDENCE:\s*/i, '').trim()) || 0.5;
    } else if (line.toUpperCase().startsWith('REASON:')) {
      reason = line.replace(/^REASON:\s*/i, '').trim();
    }
  }

  // Validate mood
  const validMoods = ['excited', 'positive', 'angry', 'negative', 'confused', 'neutral'];
  if (!validMoods.includes(mood)) {
    mood = 'neutral';
  }

  return {
    mood,
    confidence: Math.min(1, Math.max(0, confidence)),
    summary: reason,
    emoji: MOOD_EMOJIS[mood] || '😐'
  };
}

/**
 * Compute sentiment using rule-based fallback (no LLM)
 */
function computeFallbackSentiment(signals) {
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

  // If very few sentiment signals, default to neutral
  if (sentimentTotal < 3) {
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

  // Upgrade positive to excited if very high sentiment score
  let mood = dominant.mood;
  if (mood === 'positive' && signals.sentiment_score > 30) {
    mood = 'excited';
  }
  // Upgrade negative to angry if very low sentiment score
  if (mood === 'negative' && signals.sentiment_score < -30) {
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
    console.log('[LLM] Engine reset');
  }
}

export {
  initializeLLM,
  summarizeBuckets,
  analyzeSentiment,
  computeFallbackSentiment,
  isLLMReady,
  resetLLM
};
