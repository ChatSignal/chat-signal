// Options page for Chat Signal settings

import { DEFAULT_SETTINGS } from '../settings-defaults.js';

// DOM elements
const form = document.getElementById('settings-form');
const resetBtn = document.getElementById('reset-btn');
const statusDiv = document.getElementById('status');

// Input elements
const inputs = {
  topicMinCount: document.getElementById('topic-min-count'),
  spamThreshold: document.getElementById('spam-threshold'),
  duplicateWindow: document.getElementById('duplicate-window'),
  sentimentSensitivity: document.getElementById('sentiment-sensitivity'),
  moodUpgradeThreshold: document.getElementById('mood-upgrade-threshold'),
  analysisWindowSize: document.getElementById('analysis-window-size'),
  inactivityTimeout: document.getElementById('inactivity-timeout'),
  aiSummariesEnabled: document.getElementById('ai-summaries-toggle')
};

// Value display elements
const displays = {
  topicMinCount: document.getElementById('topic-min-count-value'),
  spamThreshold: document.getElementById('spam-threshold-value'),
  duplicateWindow: document.getElementById('duplicate-window-value'),
  sentimentSensitivity: document.getElementById('sentiment-sensitivity-value'),
  moodUpgradeThreshold: document.getElementById('mood-upgrade-threshold-value'),
  inactivityTimeout: document.getElementById('inactivity-timeout-value')
};

// Time estimate for analysis window slider
function getTimeEstimate(msgCount) {
  const msgsPerSec = 3;
  const seconds = Math.round(msgCount / msgsPerSec);
  if (seconds < 60) return `~${seconds}s of active chat`;
  return `~${Math.round(seconds / 60)}m of active chat`;
}

// Update value displays when sliders change
function updateDisplays(settings) {
  displays.topicMinCount.textContent = settings.topicMinCount;
  displays.spamThreshold.textContent = settings.spamThreshold;
  displays.duplicateWindow.textContent = `${settings.duplicateWindow}s`;
  displays.sentimentSensitivity.textContent = settings.sentimentSensitivity;
  displays.moodUpgradeThreshold.textContent = settings.moodUpgradeThreshold;
  displays.inactivityTimeout.textContent = `${settings.inactivityTimeout}s`;

  const windowVal = settings.analysisWindowSize;
  const windowDisplay = document.getElementById('analysis-window-size-value');
  if (windowDisplay) windowDisplay.textContent = windowVal;
  const estimateEl = document.getElementById('analysis-window-size-estimate');
  if (estimateEl) estimateEl.textContent = getTimeEstimate(windowVal);
  const warningEl = document.getElementById('analysis-window-warning');
  if (warningEl) warningEl.classList.toggle('hidden', windowVal > 50);
}

// Set input values from settings
function setInputValues(settings) {
  inputs.topicMinCount.value = settings.topicMinCount;
  inputs.spamThreshold.value = settings.spamThreshold;
  inputs.duplicateWindow.value = settings.duplicateWindow;
  inputs.sentimentSensitivity.value = settings.sentimentSensitivity;
  inputs.moodUpgradeThreshold.value = settings.moodUpgradeThreshold;
  if (inputs.analysisWindowSize) inputs.analysisWindowSize.value = settings.analysisWindowSize;
  if (inputs.inactivityTimeout) inputs.inactivityTimeout.value = settings.inactivityTimeout;
  if (inputs.aiSummariesEnabled) inputs.aiSummariesEnabled.checked = !!settings.aiSummariesEnabled;
  updateDisplays(settings);
}

// Get current values from inputs
function getInputValues() {
  return {
    topicMinCount: parseInt(inputs.topicMinCount.value, 10),
    spamThreshold: parseInt(inputs.spamThreshold.value, 10),
    duplicateWindow: parseInt(inputs.duplicateWindow.value, 10),
    sentimentSensitivity: parseInt(inputs.sentimentSensitivity.value, 10),
    moodUpgradeThreshold: parseInt(inputs.moodUpgradeThreshold.value, 10),
    analysisWindowSize: parseInt(inputs.analysisWindowSize.value, 10),
    inactivityTimeout: parseInt(inputs.inactivityTimeout.value, 10)
  };
}

// Validate input values — returns object of field -> error message (empty = valid)
function validateInputValues(values) {
  const errors = {};
  if (!Number.isFinite(values.topicMinCount) || values.topicMinCount < 1 || values.topicMinCount > 20) {
    errors.topicMinCount = 'Must be 1-20';
  }
  if (!Number.isFinite(values.spamThreshold) || values.spamThreshold < 1 || values.spamThreshold > 10) {
    errors.spamThreshold = 'Must be 1-10';
  }
  if (!Number.isFinite(values.duplicateWindow) || values.duplicateWindow < 10 || values.duplicateWindow > 120) {
    errors.duplicateWindow = 'Must be 10-120';
  }
  if (!Number.isFinite(values.sentimentSensitivity) || values.sentimentSensitivity < 1 || values.sentimentSensitivity > 10) {
    errors.sentimentSensitivity = 'Must be 1-10';
  }
  if (!Number.isFinite(values.moodUpgradeThreshold) || values.moodUpgradeThreshold < 10 || values.moodUpgradeThreshold > 50) {
    errors.moodUpgradeThreshold = 'Must be 10-50';
  }
  if (!Number.isFinite(values.analysisWindowSize) || values.analysisWindowSize < 50 || values.analysisWindowSize > 1000) {
    errors.analysisWindowSize = 'Must be 50-1000';
  }
  if (!Number.isFinite(values.inactivityTimeout) || values.inactivityTimeout < 30 || values.inactivityTimeout > 600) {
    errors.inactivityTimeout = 'Must be 30-600';
  }
  return errors;
}

// Show/hide inline validation errors using existing .setting-warning class
function showValidationErrors(errors) {
  Object.keys(inputs).forEach(key => {
    if (key === 'aiSummariesEnabled') return; // Skip non-numeric toggle
    const input = inputs[key];
    const warningId = `${input.id}-warning`;
    let warningEl = document.getElementById(warningId);
    if (errors[key]) {
      if (!warningEl) {
        warningEl = document.createElement('span');
        warningEl.id = warningId;
        warningEl.className = 'setting-warning';
        input.closest('.input-group').appendChild(warningEl);
      }
      warningEl.textContent = errors[key];
      warningEl.classList.remove('hidden');
    } else if (warningEl) {
      warningEl.textContent = '';
      warningEl.classList.add('hidden');
    }
  });
}

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };
    setInputValues(settings);
    // Validate on load to catch corrupt stored data
    const errors = validateInputValues(getInputValues());
    showValidationErrors(errors);
    document.getElementById('save-btn').disabled = Object.keys(errors).length > 0;
  } catch (error) {
    console.error('Failed to load settings:', error);
    setInputValues(DEFAULT_SETTINGS);
  }
}

// Save settings to chrome.storage
async function saveSettings() {
  try {
    const values = getInputValues();
    const errors = validateInputValues(values);
    if (Object.keys(errors).length > 0) {
      showStatus('Fix validation errors before saving', 'error');
      return;
    }
    // Merge with existing settings to preserve keys not on this page (e.g. aiSummariesEnabled)
    const existing = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...existing.settings, ...values } });
    showStatus('Settings saved!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

// Reset to default settings
async function resetToDefaults() {
  try {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    setInputValues(DEFAULT_SETTINGS);
    showValidationErrors({});
    document.getElementById('save-btn').disabled = false;
    showStatus('Reset to defaults', 'success');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('Failed to reset settings', 'error');
  }
}

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  // Hide after 2 seconds
  setTimeout(() => {
    statusDiv.classList.add('hidden');
  }, 2000);
}

// Event listeners for real-time value display updates and validation
Object.keys(inputs).forEach(key => {
  if (key === 'aiSummariesEnabled') return; // Toggle has its own handler
  inputs[key].addEventListener('input', () => {
    const values = getInputValues();
    updateDisplays(values);
    const errors = validateInputValues(values);
    showValidationErrors(errors);
    document.getElementById('save-btn').disabled = Object.keys(errors).length > 0;
  });
});

// AI Summaries toggle — auto-save immediately on change
if (inputs.aiSummariesEnabled) {
  inputs.aiSummariesEnabled.addEventListener('change', async () => {
    try {
      const existing = await chrome.storage.sync.get('settings');
      const updated = { ...existing.settings, aiSummariesEnabled: inputs.aiSummariesEnabled.checked };
      await chrome.storage.sync.set({ settings: updated });
      showStatus(inputs.aiSummariesEnabled.checked ? 'AI summaries enabled' : 'AI summaries disabled', 'success');
    } catch (error) {
      console.error('Failed to save AI toggle:', error);
      showStatus('Failed to save AI setting', 'error');
    }
  });
}

// Form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSettings();
});

// Reset button
resetBtn.addEventListener('click', async () => {
  await resetToDefaults();
});

// Load encoder backend info from chrome.storage.local (written by sidebar after encoder init)
async function loadEncoderInfo() {
  const el = document.getElementById('encoder-backend-value');
  if (!el) return;

  try {
    const result = await chrome.storage.local.get('encoderBackend');
    const info = result.encoderBackend;

    if (!info) {
      // Sidebar hasn't been opened yet — encoder hasn't run
      el.textContent = '—';
      return;
    }

    const { state, backend } = info;

    if (state === 'ready') {
      el.textContent = backend === 'webgpu' ? 'WebGPU' : 'WASM (CPU)';
    } else if (state === 'loading') {
      el.textContent = 'Loading...';
    } else if (state === 'error') {
      el.textContent = 'Not available';
    } else {
      el.textContent = '—';
    }
  } catch (err) {
    console.warn('[Options] Failed to load encoder info:', err);
    el.textContent = '—';
  }
}

// Load settings on page load
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadEncoderInfo();
});

if (typeof globalThis !== 'undefined' && globalThis.__CHAT_SIGNAL_RADAR_TEST__ === true) {
  globalThis.ChatSignalRadarOptions = {
    DEFAULT_SETTINGS,
    updateDisplays,
    setInputValues,
    getInputValues,
    validateInputValues,
    showValidationErrors,
    loadSettings,
    saveSettings,
    resetToDefaults
  };
}
