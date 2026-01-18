// Sidebar script - loads WASM and processes chat messages

import { initializeLLM, summarizeBuckets, analyzeSentiment, computeFallbackSentiment, isLLMReady, resetLLM } from '../llm-adapter.js';
import { saveSession, loadSessions, deleteSession, clearAllSessions } from '../storage-manager.js';

const DEBUG = false;
const isTestEnv = typeof globalThis !== 'undefined' && globalThis.__CHAT_SIGNAL_RADAR_TEST__ === true;

let wasmModule = null;
let llmEnabled = false;
let llmConsentAsked = false;

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

// LLM consent modal elements
const llmConsentModal = document.getElementById('llm-consent-modal');
const llmEnableBtn = document.getElementById('llm-enable-btn');
const llmSkipBtn = document.getElementById('llm-skip-btn');
const llmRememberChoice = document.getElementById('llm-remember-choice');

// Stream ended prompt elements
const streamEndedPrompt = document.getElementById('stream-ended-prompt');
const saveSessionBtn = document.getElementById('save-session-btn');
const dismissPromptBtn = document.getElementById('dismiss-prompt-btn');

// Tab and history elements
const liveTab = document.getElementById('live-tab');
const historyTab = document.getElementById('history-tab');
const historyView = document.getElementById('history-view');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Session tracking
let sessionStartTime = null;
let lastAnalysisResult = null;
let currentPlatform = null;
let currentStreamTitle = null;
let currentStreamUrl = null;
let currentMood = 'neutral';

// Accumulate questions across entire session (not just last 100 messages)
let sessionQuestions = [];
const MAX_SESSION_QUESTIONS = 50; // Keep up to 50 unique questions per session

// Total messages seen this session (cumulative, doesn't decrease)
let totalMessageCount = 0;

// Cumulative sentiment counts for entire session
let sessionSentiment = {
  positive_count: 0,
  negative_count: 0,
  confused_count: 0,
  neutral_count: 0
};

// Inactivity detection
let lastMessageTime = null;
let inactivityCheckInterval = null;
const INACTIVITY_TIMEOUT = 120000; // 2 minutes

// Current view state
let currentView = 'live'; // 'live' or 'history'

// Settings link opens options page
if (!isTestEnv) {
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

  // LLM consent modal handlers
  llmEnableBtn.addEventListener('click', async () => {
    llmConsentModal.classList.add('hidden');
    if (llmRememberChoice.checked) {
      await chrome.storage.sync.set({ llmConsent: true });
    }
    startLLMInitialization();
  });

  llmSkipBtn.addEventListener('click', async () => {
    llmConsentModal.classList.add('hidden');
    if (llmRememberChoice.checked) {
      await chrome.storage.sync.set({ llmConsent: false });
    }
    llmEnabled = false;
    statusText.textContent = 'Ready! Waiting for chat messages...';
  });

  // Stream ended prompt handlers
  saveSessionBtn.addEventListener('click', async () => {
    streamEndedPrompt.classList.add('hidden');
    await saveCurrentSession();
    showSessionSummary();
  });

  dismissPromptBtn.addEventListener('click', () => {
    streamEndedPrompt.classList.add('hidden');
  });

  // Tab handlers
  liveTab.addEventListener('click', () => switchToView('live'));
  historyTab.addEventListener('click', () => switchToView('history'));

  // Clear history button
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Clear all session history? This cannot be undone.')) {
      await clearAllSessions();
      renderHistoryList([]);
    }
  });
}

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = { ...DEFAULT_SETTINGS, ...result.settings };
    updateAiSummaryState();
  } catch (error) {
    console.warn('[Sidebar] Failed to load settings, using defaults:', error);
    settings = { ...DEFAULT_SETTINGS };
    updateAiSummaryState();
  }
}

// Listen for settings changes
if (!isTestEnv) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.settings) {
      settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      updateAiSummaryState();
    }
  });
}

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

    // Check for LLM consent before initializing
    await checkLLMConsent();

  } catch (error) {
    console.error('Failed to load WASM:', error);
    statusText.textContent = 'Error loading clustering engine';
    errorDiv.textContent = `Failed to load WASM: ${error.message}`;
    errorDiv.classList.remove('hidden');
  }
}

// Check LLM consent and show modal if needed
async function checkLLMConsent() {
  try {
    const result = await chrome.storage.sync.get('llmConsent');

    if (result.llmConsent === true) {
      // User previously consented, initialize LLM
      startLLMInitialization();
    } else if (result.llmConsent === false) {
      // User previously declined
      llmEnabled = false;
      statusText.textContent = 'Ready! Waiting for chat messages...';
    } else {
      // No preference saved, show consent modal
      statusText.textContent = 'Ready! Waiting for chat messages...';
      llmConsentModal.classList.remove('hidden');
    }
  } catch (error) {
    console.warn('[Sidebar] Failed to check LLM consent:', error);
    statusText.textContent = 'Ready! Waiting for chat messages...';
  }
}

// Start LLM initialization after consent
function startLLMInitialization() {
  statusText.textContent = 'Loading AI model...';

  initializeLLM((progress) => {
    statusText.textContent = `Loading AI: ${Math.round(progress.progress * 100)}%`;
  }).then(() => {
    llmEnabled = true;
    statusText.textContent = 'Ready! Waiting for chat messages...';
    if (DEBUG) console.log('[Sidebar] LLM initialized');
  }).catch((error) => {
    console.warn('[Sidebar] LLM initialization failed, continuing without AI summaries:', error);
    llmEnabled = false;
    statusText.textContent = 'Ready! Waiting for chat messages...';
  });
}

function updateAiSummaryState() {
  if (!aiOptIn) {
    return;
  }

  if (settings.aiSummariesEnabled) {
    aiOptIn.classList.add('hidden');
    if (!isLLMReady() && !llmEnabled) {
      startLLMInitialization();
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
    processedCount.textContent = totalMessageCount;

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

    // Accumulate questions for the session summary
    const questionsBucket = result.buckets?.find(b => b.label === 'Questions');
    if (questionsBucket && questionsBucket.sample_messages) {
      questionsBucket.sample_messages.forEach(q => {
        // Add if not already in session questions (avoid duplicates)
        if (!sessionQuestions.includes(q)) {
          sessionQuestions.push(q);
          // Keep only the most recent questions if we exceed the limit
          if (sessionQuestions.length > MAX_SESSION_QUESTIONS) {
            sessionQuestions.shift();
          }
        }
      });
    }

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

  // Track current mood for session saving
  currentMood = sentimentResult.mood;
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
if (!isTestEnv) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHAT_MESSAGES') {
      // Track platform and stream info
      if (message.platform) currentPlatform = message.platform;
      if (message.streamTitle) currentStreamTitle = message.streamTitle;
      if (message.streamUrl) currentStreamUrl = message.streamUrl;

      // Update last message time for inactivity detection
      lastMessageTime = Date.now();
      startInactivityCheck();

      // Hide stream ended prompt if showing
      streamEndedPrompt.classList.add('hidden');

      // Track total messages seen this session
      totalMessageCount += message.messages.length;

      // Accumulate sentiment from new messages (before adding to rolling window)
      if (wasmModule && message.messages.length > 0) {
        try {
          const batchResult = wasmModule.analyze_chat_with_settings(
            message.messages,
            settings.topicMinCount,
            settings.spamThreshold,
            settings.duplicateWindow * 1000
          );
          if (batchResult && batchResult.sentiment_signals) {
            sessionSentiment.positive_count += batchResult.sentiment_signals.positive_count;
            sessionSentiment.negative_count += batchResult.sentiment_signals.negative_count;
            sessionSentiment.confused_count += batchResult.sentiment_signals.confused_count;
            sessionSentiment.neutral_count += batchResult.sentiment_signals.neutral_count;
          }
        } catch (e) {
          // Ignore errors in batch sentiment, will still process normally
        }
      }

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
}

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
  document.getElementById('summary-messages').textContent = totalMessageCount;

  // Update sentiment bars - use session-accumulated sentiment
  const sentimentContainer = document.getElementById('summary-sentiment');
  const total = sessionSentiment.positive_count + sessionSentiment.negative_count +
                sessionSentiment.confused_count + sessionSentiment.neutral_count;

  if (total > 0) {
    sentimentContainer.innerHTML = ['positive', 'negative', 'confused', 'neutral'].map(type => {
      const count = sessionSentiment[`${type}_count`];
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

  // Update top questions - use session-accumulated questions
  const questionsContainer = document.getElementById('summary-questions');
  if (sessionQuestions.length > 0) {
    // Show most recent questions first (reverse order)
    const recentQuestions = [...sessionQuestions].reverse().slice(0, 5);
    questionsContainer.innerHTML = recentQuestions.map(msg =>
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

  let text = `📡 CHAT SIGNAL RADAR - SESSION SUMMARY\n`;
  text += `${'='.repeat(40)}\n\n`;

  text += `⏱️  Duration: ${formatDuration(duration)}\n`;
  text += `💬 Messages: ${totalMessageCount}\n\n`;

  // Sentiment - use session-accumulated counts
  const total = sessionSentiment.positive_count + sessionSentiment.negative_count +
                sessionSentiment.confused_count + sessionSentiment.neutral_count;
  const score = total > 0
    ? Math.round(((sessionSentiment.positive_count - sessionSentiment.negative_count) / total) * 100)
    : 0;

  text += `📊 SENTIMENT BREAKDOWN\n`;
  text += `   Positive: ${sessionSentiment.positive_count}\n`;
  text += `   Negative: ${sessionSentiment.negative_count}\n`;
  text += `   Confused: ${sessionSentiment.confused_count}\n`;
  text += `   Neutral:  ${sessionSentiment.neutral_count}\n`;
  text += `   Score:    ${score}/100\n\n`;

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

  // Top questions - use session-accumulated questions
  if (sessionQuestions.length > 0) {
    text += `❓ TOP QUESTIONS\n`;
    const recentQuestions = [...sessionQuestions].reverse().slice(0, 5);
    recentQuestions.forEach((msg, i) => {
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
  sessionQuestions = [];
  totalMessageCount = 0;
  sessionSentiment = { positive_count: 0, negative_count: 0, confused_count: 0, neutral_count: 0 };
  currentPlatform = null;
  currentStreamTitle = null;
  currentStreamUrl = null;
  currentMood = 'neutral';

  // Stop inactivity check
  stopInactivityCheck();

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

  // Switch to live view
  switchToView('live');
}

// ============================================================================
// INACTIVITY DETECTION
// ============================================================================

function startInactivityCheck() {
  // Clear existing interval if any
  if (inactivityCheckInterval) {
    clearInterval(inactivityCheckInterval);
  }

  inactivityCheckInterval = setInterval(() => {
    if (lastMessageTime && sessionStartTime) {
      const timeSinceLastMessage = Date.now() - lastMessageTime;
      if (timeSinceLastMessage >= INACTIVITY_TIMEOUT) {
        showStreamEndedPrompt();
        stopInactivityCheck();
      }
    }
  }, 10000); // Check every 10 seconds
}

function stopInactivityCheck() {
  if (inactivityCheckInterval) {
    clearInterval(inactivityCheckInterval);
    inactivityCheckInterval = null;
  }
}

function showStreamEndedPrompt() {
  // Only show if we have session data
  if (lastAnalysisResult && sessionStartTime) {
    streamEndedPrompt.classList.remove('hidden');
  }
}

// ============================================================================
// SESSION PERSISTENCE
// ============================================================================

async function saveCurrentSession() {
  if (!lastAnalysisResult || !sessionStartTime) {
    return null;
  }

  const endTime = Date.now();
  const sessionData = {
    startTime: sessionStartTime,
    endTime: endTime,
    duration: endTime - sessionStartTime,
    platform: currentPlatform || 'unknown',
    streamTitle: currentStreamTitle || 'Unknown Stream',
    streamUrl: currentStreamUrl || '',
    messageCount: totalMessageCount,
    buckets: lastAnalysisResult.buckets,
    topics: lastAnalysisResult.topics,
    sentimentSignals: { ...sessionSentiment },
    mood: currentMood,
    sessionQuestions: [...sessionQuestions] // Save accumulated questions
  };

  try {
    const sessionId = await saveSession(sessionData);
    if (DEBUG) console.log('[Sidebar] Session saved:', sessionId);
    return sessionId;
  } catch (error) {
    console.error('[Sidebar] Failed to save session:', error);
    return null;
  }
}

// ============================================================================
// HISTORY VIEW
// ============================================================================

function switchToView(view) {
  currentView = view;

  if (view === 'live') {
    liveTab.classList.add('active');
    historyTab.classList.remove('active');
    historyView.classList.add('hidden');

    // Show live view elements
    statusDiv.classList.remove('hidden');
    if (lastAnalysisResult) {
      statsDiv.classList.remove('hidden');
      moodSection.classList.remove('hidden');
      topicsSection.classList.remove('hidden');
      clustersDiv.classList.remove('hidden');
    } else {
      firstRunDiv.classList.remove('hidden');
    }
  } else if (view === 'history') {
    historyTab.classList.add('active');
    liveTab.classList.remove('active');
    historyView.classList.remove('hidden');

    // Hide live view elements
    statusDiv.classList.add('hidden');
    statsDiv.classList.add('hidden');
    moodSection.classList.add('hidden');
    topicsSection.classList.add('hidden');
    clustersDiv.classList.add('hidden');
    firstRunDiv.classList.add('hidden');
    aiSummaryDiv.classList.add('hidden');

    // Load and render history
    loadAndRenderHistory();
  }
}

async function loadAndRenderHistory() {
  const sessions = await loadSessions();
  renderHistoryList(sessions);
}

function renderHistoryList(sessions) {
  historyList.innerHTML = '';

  if (sessions.length === 0) {
    historyEmpty.classList.remove('hidden');
    clearHistoryBtn.classList.add('hidden');
    return;
  }

  historyEmpty.classList.add('hidden');
  clearHistoryBtn.classList.remove('hidden');

  sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.addEventListener('click', () => viewSessionDetail(session));

    const date = new Date(session.startTime);
    const dateStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <div class="session-card-header">
        <span class="session-card-date">${escapeHtml(dateStr)}</span>
        <span class="session-card-platform">${escapeHtml(session.platform)}</span>
      </div>
      <div class="session-card-stats">
        <span class="session-card-stat">
          <span>${formatDuration(session.duration)}</span>
        </span>
        <span class="session-card-stat">
          <span>${session.messageCount} msgs</span>
        </span>
      </div>
      <div class="session-card-mood">
        ${MOOD_EMOJIS[session.mood] || '😐'} ${session.mood}
      </div>
      <button class="session-card-delete" title="Delete session">
        <span>x</span>
      </button>
    `;

    // Handle delete button separately
    const deleteBtn = card.querySelector('.session-card-delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this session?')) {
        await deleteSession(session.id);
        loadAndRenderHistory();
      }
    });

    historyList.appendChild(card);
  });
}

function viewSessionDetail(session) {
  // Populate the summary modal with session data
  document.getElementById('summary-duration').textContent = formatDuration(session.duration);
  document.getElementById('summary-messages').textContent = session.messageCount;

  // Update sentiment bars
  const sentimentContainer = document.getElementById('summary-sentiment');
  const signals = session.sentimentSignals;
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
  if (session.topics && session.topics.length > 0) {
    topicsContainer.innerHTML = session.topics.slice(0, 10).map(topic =>
      `<span class="summary-topic ${topic.is_emote ? 'emote' : ''}">${escapeHtml(topic.term)} (${topic.count})</span>`
    ).join('');
  } else {
    topicsContainer.innerHTML = '<p class="summary-no-data">No trending topics</p>';
  }

  // Update clusters
  const clustersContainer = document.getElementById('summary-clusters');
  if (session.buckets && session.buckets.length > 0) {
    clustersContainer.innerHTML = session.buckets.map(bucket =>
      `<div class="summary-cluster">
        <span class="summary-cluster-label">${escapeHtml(bucket.label)}:</span>
        <span class="summary-cluster-count">${bucket.count}</span>
      </div>`
    ).join('');
  } else {
    clustersContainer.innerHTML = '<p class="summary-no-data">No clusters</p>';
  }

  // Update top questions - use saved session questions if available
  const questionsContainer = document.getElementById('summary-questions');
  const savedQuestions = session.sessionQuestions || [];
  if (savedQuestions.length > 0) {
    const recentQuestions = [...savedQuestions].reverse().slice(0, 5);
    questionsContainer.innerHTML = recentQuestions.map(msg =>
      `<div class="summary-question">${escapeHtml(msg)}</div>`
    ).join('');
  } else {
    // Fallback to bucket sample messages for older sessions
    const questionsBucket = session.buckets?.find(b => b.label === 'Questions');
    if (questionsBucket && questionsBucket.sample_messages.length > 0) {
      questionsContainer.innerHTML = questionsBucket.sample_messages.slice(0, 3).map(msg =>
        `<div class="summary-question">${escapeHtml(msg)}</div>`
      ).join('');
    } else {
      questionsContainer.innerHTML = '<p class="summary-no-data">No questions captured</p>';
    }
  }

  // Update modal title to indicate it's a past session
  const modalTitle = summaryModal.querySelector('h2');
  const date = new Date(session.startTime);
  modalTitle.textContent = `Session Summary - ${date.toLocaleDateString()}`;

  // Change buttons for history view
  copySummaryBtn.textContent = 'Copy Summary';
  closeSummaryBtn.textContent = 'Close';

  // Temporarily override close button behavior for history view
  const originalCloseHandler = closeSummaryBtn.onclick;
  closeSummaryBtn.onclick = () => {
    summaryModal.classList.add('hidden');
    modalTitle.textContent = 'Session Summary';
    closeSummaryBtn.textContent = 'Start New Session';
    closeSummaryBtn.onclick = originalCloseHandler;
  };

  // Show modal
  summaryModal.classList.remove('hidden');
}

// Export for testing
if (isTestEnv && typeof globalThis !== 'undefined') {
  globalThis.ChatSignalRadarSidebar = {
    updateAiSummaryState,
    updateMoodIndicator,
    updateTopics,
    formatDuration,
    generateSummaryText,
    showSessionSummary,
    startInactivityCheck,
    stopInactivityCheck,
    saveCurrentSession,
    switchToView,
    renderHistoryList,
    setSidebarState: (state) => {
      if (state.settings) {
        settings = state.settings;
      }
      if (typeof state.llmEnabled === 'boolean') {
        llmEnabled = state.llmEnabled;
      }
      if (state.sessionStartTime !== undefined) {
        sessionStartTime = state.sessionStartTime;
      }
      if (state.lastAnalysisResult !== undefined) {
        lastAnalysisResult = state.lastAnalysisResult;
      }
      if (state.totalMessageCount !== undefined) {
        totalMessageCount = state.totalMessageCount;
      }
      if (state.sessionSentiment !== undefined) {
        sessionSentiment = state.sessionSentiment;
      }
      if (state.sessionQuestions !== undefined) {
        sessionQuestions = state.sessionQuestions;
      }
    }
  };
}
