// Sidebar script - loads WASM and processes chat messages

import { initializeLLM, summarizeBuckets, analyzeSentiment, computeFallbackSentiment, isLLMReady, resetLLM } from '../llm-adapter.js';

let wasmModule = null;
let llmEnabled = false;

// Default settings (must match options.js)
const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  sentimentSensitivity: 3,
  moodUpgradeThreshold: 30,
  aiSummariesEnabled: false
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
const aiOptIn = document.getElementById('ai-opt-in');
const enableAiBtn = document.getElementById('enable-ai-btn');
const firstRunDiv = document.getElementById('first-run');
const settingsLink = document.getElementById('settings-link');
const endSessionBtn = document.getElementById('end-session-btn');
const summaryModal = document.getElementById('summary-modal');
const copySummaryBtn = document.getElementById('copy-summary-btn');
const closeSummaryBtn = document.getElementById('close-summary-btn');
const copyToast = document.getElementById('copy-toast');

// Session tracking
let sessionStartTime = null;
let lastAnalysisResult = null;

// Settings link opens options page
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

enableAiBtn.addEventListener('click', async () => {
  const updatedSettings = { ...settings, aiSummariesEnabled: true };
  await chrome.storage.sync.set({ settings: updatedSettings });
});

// End session button
endSessionBtn.addEventListener('click', showSessionSummary);

// Modal buttons
copySummaryBtn.addEventListener('click', copySummaryToClipboard);
closeSummaryBtn.addEventListener('click', startNewSession);

// Close modal on backdrop click
summaryModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  summaryModal.classList.add('hidden');
});

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULT_SETTINGS, ...result.settings };
    console.log('[Sidebar] Settings loaded:', settings);
    updateAiSummaryState();
  } catch (error) {
    console.warn('[Sidebar] Failed to load settings, using defaults:', error);
    settings = { ...DEFAULT_SETTINGS };
    updateAiSummaryState();
  }
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    console.log('[Sidebar] Settings updated:', settings);
    updateAiSummaryState();
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
    
    if (settings.aiSummariesEnabled) {
      await initializeAIModel();
    } else {
      statusText.textContent = 'Ready! Waiting for chat messages...';
    }
    
  } catch (error) {
    console.error('Failed to load WASM:', error);
    statusText.textContent = 'Error loading clustering engine';
    errorDiv.textContent = `Failed to load WASM: ${error.message}`;
    errorDiv.classList.remove('hidden');
  }
}

async function initializeAIModel() {
  statusText.textContent = 'Loading AI model...';

  try {
    await initializeLLM((progress) => {
      statusText.textContent = `Loading AI: ${Math.round(progress.progress * 100)}%`;
    });
    llmEnabled = true;
    statusText.textContent = 'Ready! Waiting for chat messages...';
    console.log('[Sidebar] LLM initialized');
  } catch (error) {
    console.warn('[Sidebar] LLM initialization failed, continuing without AI summaries:', error);
    llmEnabled = false;
    statusText.textContent = 'Ready! Waiting for chat messages...';
  }
}

function updateAiSummaryState() {
  if (!aiOptIn) {
    return;
  }

  if (settings.aiSummariesEnabled) {
    aiOptIn.classList.add('hidden');
    if (!isLLMReady() && !llmEnabled) {
      initializeAIModel();
    }
  } else {
    aiOptIn.classList.remove('hidden');
    aiSummaryDiv.classList.add('hidden');
    llmEnabled = false;
    resetLLM();
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

    // Start session timer on first message
    if (!sessionStartTime) {
      sessionStartTime = Date.now();
    }

    // Show End Session button
    endSessionBtn.classList.remove('hidden');

    // Store latest analysis result for summary
    lastAnalysisResult = result;

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

// ============================================================================
// SESSION SUMMARY FUNCTIONS
// ============================================================================

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function showSessionSummary() {
  if (!lastAnalysisResult || !sessionStartTime) {
    return;
  }

  const duration = Date.now() - sessionStartTime;
  const result = lastAnalysisResult;

  // Update duration and message count
  document.getElementById('summary-duration').textContent = formatDuration(duration);
  document.getElementById('summary-messages').textContent = result.processed_count;

  // Update sentiment bars
  const sentimentContainer = document.getElementById('summary-sentiment');
  const signals = result.sentiment_signals;
  const total = signals.positive_count + signals.negative_count + signals.confused_count + signals.neutral_count;

  if (total > 0) {
    sentimentContainer.innerHTML = ['positive', 'negative', 'confused', 'neutral'].map(type => {
      const count = signals[`${type}_count`];
      const percent = Math.round((count / total) * 100);
      return `
        <div class="sentiment-bar">
          <span class="sentiment-bar-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
          <div class="sentiment-bar-track">
            <div class="sentiment-bar-fill ${type}" style="width: ${percent}%"></div>
          </div>
          <span class="sentiment-bar-value">${count}</span>
        </div>
      `;
    }).join('');
  } else {
    sentimentContainer.innerHTML = '<p class="summary-no-data">No sentiment data</p>';
  }

  // Update topics
  const topicsContainer = document.getElementById('summary-topics');
  if (result.topics && result.topics.length > 0) {
    topicsContainer.innerHTML = result.topics.slice(0, 10).map(topic =>
      `<span class="summary-topic ${topic.is_emote ? 'emote' : ''}">${escapeHtml(topic.term)} (${topic.count})</span>`
    ).join('');
  } else {
    topicsContainer.innerHTML = '<p class="summary-no-data">No trending topics</p>';
  }

  // Update clusters
  const clustersContainer = document.getElementById('summary-clusters');
  if (result.buckets && result.buckets.length > 0) {
    clustersContainer.innerHTML = result.buckets.map(bucket =>
      `<div class="summary-cluster">
        <span class="summary-cluster-label">${escapeHtml(bucket.label)}:</span>
        <span class="summary-cluster-count">${bucket.count}</span>
      </div>`
    ).join('');
  } else {
    clustersContainer.innerHTML = '<p class="summary-no-data">No clusters</p>';
  }

  // Update top questions
  const questionsContainer = document.getElementById('summary-questions');
  const questionsBucket = result.buckets?.find(b => b.label === 'Questions');
  if (questionsBucket && questionsBucket.sample_messages.length > 0) {
    questionsContainer.innerHTML = questionsBucket.sample_messages.slice(0, 3).map(msg =>
      `<div class="summary-question">${escapeHtml(msg)}</div>`
    ).join('');
  } else {
    questionsContainer.innerHTML = '<p class="summary-no-data">No questions captured</p>';
  }

  // Show modal
  summaryModal.classList.remove('hidden');
}

function generateSummaryText() {
  if (!lastAnalysisResult || !sessionStartTime) {
    return '';
  }

  const duration = Date.now() - sessionStartTime;
  const result = lastAnalysisResult;
  const signals = result.sentiment_signals;

  let text = `📡 CHAT SIGNAL RADAR - SESSION SUMMARY\n`;
  text += `${'='.repeat(40)}\n\n`;

  text += `⏱️  Duration: ${formatDuration(duration)}\n`;
  text += `💬 Messages: ${result.processed_count}\n\n`;

  // Sentiment
  text += `📊 SENTIMENT BREAKDOWN\n`;
  text += `   Positive: ${signals.positive_count}\n`;
  text += `   Negative: ${signals.negative_count}\n`;
  text += `   Confused: ${signals.confused_count}\n`;
  text += `   Neutral:  ${signals.neutral_count}\n`;
  text += `   Score:    ${signals.sentiment_score}/100\n\n`;

  // Topics
  if (result.topics && result.topics.length > 0) {
    text += `🏷️  TRENDING TOPICS\n`;
    result.topics.slice(0, 5).forEach(topic => {
      text += `   ${topic.is_emote ? '😀 ' : ''}${topic.term} (${topic.count})\n`;
    });
    text += `\n`;
  }

  // Clusters
  if (result.buckets && result.buckets.length > 0) {
    text += `📁 CLUSTERS\n`;
    result.buckets.forEach(bucket => {
      text += `   ${bucket.label}: ${bucket.count}\n`;
    });
    text += `\n`;
  }

  // Top questions
  const questionsBucket = result.buckets?.find(b => b.label === 'Questions');
  if (questionsBucket && questionsBucket.sample_messages.length > 0) {
    text += `❓ TOP QUESTIONS\n`;
    questionsBucket.sample_messages.slice(0, 3).forEach((msg, i) => {
      text += `   ${i + 1}. ${msg}\n`;
    });
    text += `\n`;
  }

  text += `${'='.repeat(40)}\n`;
  text += `Generated by Chat Signal Radar\n`;

  return text;
}

async function copySummaryToClipboard() {
  const text = generateSummaryText();

  try {
    await navigator.clipboard.writeText(text);

    // Show toast
    copyToast.classList.remove('hidden');
    setTimeout(() => {
      copyToast.classList.add('hidden');
    }, 2000);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    alert('Failed to copy to clipboard');
  }
}

function startNewSession() {
  // Reset session state
  sessionStartTime = null;
  lastAnalysisResult = null;
  allMessages = [];

  // Hide modal
  summaryModal.classList.add('hidden');

  // Reset UI
  endSessionBtn.classList.add('hidden');
  statsDiv.classList.add('hidden');
  moodSection.classList.add('hidden');
  topicsSection.classList.add('hidden');
  aiSummaryDiv.classList.add('hidden');
  clustersDiv.innerHTML = '';
  firstRunDiv.classList.remove('hidden');
  statusDiv.classList.remove('active');
  statusText.textContent = 'Waiting for chat messages...';
}
