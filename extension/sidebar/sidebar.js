// Sidebar script - loads WASM and processes chat messages

import { initializeLLM, summarizeBuckets, analyzeSentiment, computeFallbackSentiment, isLLMReady } from '../llm-adapter.js';

let wasmModule = null;
let llmEnabled = false;

// Default settings (must match options.js)
const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  sentimentSensitivity: 3,
  moodUpgradeThreshold: 30
};

let settings = { ...DEFAULT_SETTINGS };

// Mood emoji mapping
const MOOD_EMOJIS = {
  excited: '🎉',
  positive: '😊',
  angry: '😠',
  negative: '😔',
  confused: '🤔',
  neutral: '😐'
};

// Throttle sentiment analysis to every 10 seconds
let lastSentimentUpdate = 0;
const SENTIMENT_UPDATE_INTERVAL = 10000;

// DOM elements
const statusText = document.getElementById('status-text');
const statusDiv = document.getElementById('status');
const statsDiv = document.getElementById('stats');
const processedCount = document.getElementById('processed-count');
const clustersDiv = document.getElementById('clusters');
const errorDiv = document.getElementById('error');
const aiSummaryDiv = document.getElementById('ai-summary');
const aiSummaryText = document.getElementById('ai-summary-text');

// New DOM elements for mood and topics
const moodSection = document.getElementById('mood-section');
const moodEmoji = document.getElementById('mood-emoji');
const moodLabel = document.getElementById('mood-label');
const moodConfidence = document.getElementById('mood-confidence');
const moodSummary = document.getElementById('mood-summary');
const topicsSection = document.getElementById('topics-section');
const topicsCloud = document.getElementById('topics-cloud');
const firstRunDiv = document.getElementById('first-run');
const settingsLink = document.getElementById('settings-link');

// Settings link opens options page
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULT_SETTINGS, ...result.settings };
    console.log('[Sidebar] Settings loaded:', settings);
  } catch (error) {
    console.warn('[Sidebar] Failed to load settings, using defaults:', error);
    settings = { ...DEFAULT_SETTINGS };
  }
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    console.log('[Sidebar] Settings updated:', settings);
  }
});

// Initialize WASM module
async function initWasm() {
  try {
    statusText.textContent = 'Loading settings...';
    await loadSettings();

    statusText.textContent = 'Loading clustering engine...';

    // Import the WASM module
    const wasmPath = chrome.runtime.getURL('wasm/wasm_engine.js');
    const { default: init, cluster_messages, analyze_chat, analyze_chat_with_settings } = await import(wasmPath);

    // Initialize WASM
    const wasmBinaryPath = chrome.runtime.getURL('wasm/wasm_engine_bg.wasm');
    await init(wasmBinaryPath);

    wasmModule = { cluster_messages, analyze_chat, analyze_chat_with_settings };
    
    statusText.textContent = 'Loading AI model...';
    
    // Initialize LLM in background
    initializeLLM((progress) => {
      statusText.textContent = `Loading AI: ${Math.round(progress.progress * 100)}%`;
    }).then(() => {
      llmEnabled = true;
      statusText.textContent = 'Ready! Waiting for chat messages...';
      console.log('[Sidebar] LLM initialized');
    }).catch((error) => {
      console.warn('[Sidebar] LLM initialization failed, continuing without AI summaries:', error);
      llmEnabled = false;
      statusText.textContent = 'Ready! Waiting for chat messages...';
    });
    
  } catch (error) {
    console.error('Failed to load WASM:', error);
    statusText.textContent = 'Error loading clustering engine';
    errorDiv.textContent = `Failed to load WASM: ${error.message}`;
    errorDiv.classList.remove('hidden');
  }
}

// Process incoming messages
function processMessages(messages) {
  if (!wasmModule) {
    console.error('WASM module not loaded');
    return;
  }

  try {
    // Use combined analysis function with settings for spam filtering
    const result = wasmModule.analyze_chat_with_settings(
      messages,
      settings.topicMinCount,
      settings.spamThreshold,
      settings.duplicateWindow * 1000  // convert to milliseconds
    );

    // Validate AnalysisResult shape
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result from analyze_chat');
    }
    if (!Array.isArray(result.buckets)) {
      throw new Error('AnalysisResult.buckets must be an array');
    }
    if (typeof result.processed_count !== 'number') {
      throw new Error('AnalysisResult.processed_count must be a number');
    }

    // Update UI
    statusDiv.classList.add('active');
    statusText.textContent = 'Processing live chat...';
    statsDiv.classList.remove('hidden');
    processedCount.textContent = result.processed_count;

    // Hide first-run guidance once we have messages
    firstRunDiv.classList.add('hidden');

    // Update trending topics
    updateTopics(result.topics);

    // Update mood indicator (throttled)
    const now = Date.now();
    if (now - lastSentimentUpdate > SENTIMENT_UPDATE_INTERVAL) {
      lastSentimentUpdate = now;
      updateMoodIndicator(messages, result.sentiment_signals, settings);
    }

    // Clear previous clusters
    clustersDiv.innerHTML = '';

    if (result.buckets.length === 0) {
      clustersDiv.innerHTML = `
        <div class="empty-state">
          <p>No clusters yet. Keep chatting!</p>
        </div>
      `;
      return;
    }

    // Render cluster buckets - validate each bucket shape
    result.buckets.forEach(bucket => {
      if (!bucket.label || !bucket.count || !Array.isArray(bucket.sample_messages)) {
        console.warn('Invalid bucket shape:', bucket);
        return;
      }

      const bucketEl = document.createElement('div');
      bucketEl.className = 'cluster-bucket';

      bucketEl.innerHTML = `
        <div class="cluster-header">
          <div class="cluster-label">${escapeHtml(bucket.label)}</div>
          <div class="cluster-count">${bucket.count}</div>
        </div>
        <div class="cluster-messages">
          ${bucket.sample_messages.map(msg =>
            `<div class="message-item">${escapeHtml(msg)}</div>`
          ).join('')}
        </div>
      `;

      clustersDiv.appendChild(bucketEl);
    });

    // Generate AI summary if enabled
    if (llmEnabled && isLLMReady() && result.buckets.length > 0) {
      generateAISummary(result.buckets);
    }

  } catch (error) {
    console.error('Error processing messages:', error);
    errorDiv.textContent = `Processing error: ${error.message}`;
    errorDiv.classList.remove('hidden');
  }
}

// Update trending topics display
function updateTopics(topics) {
  if (!topics || topics.length === 0) {
    topicsSection.classList.add('hidden');
    return;
  }

  topicsSection.classList.remove('hidden');
  topicsCloud.innerHTML = '';

  // Determine max count for sizing
  const maxCount = Math.max(...topics.map(t => t.count));

  topics.forEach(topic => {
    const tag = document.createElement('span');
    tag.className = 'topic-tag';

    // Add emote class if applicable
    if (topic.is_emote) {
      tag.classList.add('emote');
    }

    // Size class based on relative frequency
    const ratio = topic.count / maxCount;
    if (ratio > 0.7) {
      tag.classList.add('size-large');
    } else if (ratio > 0.4) {
      tag.classList.add('size-medium');
    } else {
      tag.classList.add('size-small');
    }

    tag.innerHTML = `
      ${escapeHtml(topic.term)}
      <span class="topic-count">${topic.count}</span>
    `;

    topicsCloud.appendChild(tag);
  });
}

// Update mood indicator display
async function updateMoodIndicator(messages, sentimentSignals, currentSettings) {
  moodSection.classList.remove('hidden');

  let sentimentResult;

  if (llmEnabled && isLLMReady()) {
    try {
      // Use LLM for more accurate sentiment
      sentimentResult = await analyzeSentiment(messages, sentimentSignals);
    } catch (error) {
      console.warn('[Sidebar] LLM sentiment failed, using fallback:', error);
      sentimentResult = computeFallbackSentiment(sentimentSignals, currentSettings);
    }
  } else {
    // Use rule-based fallback
    sentimentResult = computeFallbackSentiment(sentimentSignals, currentSettings);
  }

  // Get previous mood for animation
  const moodClasses = ['excited', 'positive', 'angry', 'negative', 'confused', 'neutral'];
  const previousMood = moodClasses.find(c => moodSection.classList.contains(c));

  // Remove previous mood class, add new one
  moodClasses.forEach(c => moodSection.classList.remove(c));
  moodSection.classList.add(sentimentResult.mood);

  // Animate emoji change
  if (previousMood !== sentimentResult.mood) {
    moodEmoji.classList.add('pulse');
    setTimeout(() => moodEmoji.classList.remove('pulse'), 500);
  }

  moodEmoji.textContent = MOOD_EMOJIS[sentimentResult.mood] || '😐';
  moodLabel.textContent = sentimentResult.mood;
  moodConfidence.textContent = `${Math.round(sentimentResult.confidence * 100)}% confidence`;
  moodSummary.textContent = sentimentResult.summary || '';
}

// Generate AI summary from buckets
async function generateAISummary(buckets) {
  try {
    aiSummaryText.textContent = 'Generating AI summary...';
    aiSummaryDiv.classList.remove('hidden');
    
    const summary = await summarizeBuckets(buckets);
    aiSummaryText.textContent = summary.summary;
    
  } catch (error) {
    console.error('[Sidebar] AI summary failed:', error);
    aiSummaryDiv.classList.add('hidden');
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Accumulate messages across batches for better clustering
let allMessages = [];
const MAX_MESSAGES = 100; // Keep last 100 messages

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT_MESSAGES') {
    // Add new messages to accumulator
    allMessages.push(...message.messages);
    
    // Keep only recent messages
    if (allMessages.length > MAX_MESSAGES) {
      allMessages = allMessages.slice(-MAX_MESSAGES);
    }
    
    // Process all accumulated messages
    processMessages(allMessages);
  }
});

// Initialize on load
initWasm();
