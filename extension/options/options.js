// Options page for Chat Signal Radar settings

const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  sentimentSensitivity: 3,
  moodUpgradeThreshold: 30,
  aiSummariesEnabled: false
};

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
  aiSummariesEnabled: document.getElementById('ai-summaries-enabled')
};

// Value display elements
const displays = {
  topicMinCount: document.getElementById('topic-min-count-value'),
  spamThreshold: document.getElementById('spam-threshold-value'),
  duplicateWindow: document.getElementById('duplicate-window-value'),
  sentimentSensitivity: document.getElementById('sentiment-sensitivity-value'),
  moodUpgradeThreshold: document.getElementById('mood-upgrade-threshold-value')
};

// Update value displays when sliders change
function updateDisplays(settings) {
  displays.topicMinCount.textContent = settings.topicMinCount;
  displays.spamThreshold.textContent = settings.spamThreshold;
  displays.duplicateWindow.textContent = `${settings.duplicateWindow}s`;
  displays.sentimentSensitivity.textContent = settings.sentimentSensitivity;
  displays.moodUpgradeThreshold.textContent = settings.moodUpgradeThreshold;
}

// Set input values from settings
function setInputValues(settings) {
  inputs.topicMinCount.value = settings.topicMinCount;
  inputs.spamThreshold.value = settings.spamThreshold;
  inputs.duplicateWindow.value = settings.duplicateWindow;
  inputs.sentimentSensitivity.value = settings.sentimentSensitivity;
  inputs.moodUpgradeThreshold.value = settings.moodUpgradeThreshold;
  inputs.aiSummariesEnabled.checked = Boolean(settings.aiSummariesEnabled);
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
    aiSummariesEnabled: inputs.aiSummariesEnabled.checked
  };
}

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };
    setInputValues(settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    setInputValues(DEFAULT_SETTINGS);
  }
}

// Save settings to chrome.storage
async function saveSettings() {
  try {
    const settings = getInputValues();
    await chrome.storage.sync.set({ settings });
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

// Event listeners for real-time value display updates
Object.keys(inputs).forEach(key => {
  inputs[key].addEventListener('input', () => {
    const settings = getInputValues();
    updateDisplays(settings);
  });
});

// Form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSettings();
});

// Reset button
resetBtn.addEventListener('click', async () => {
  await resetToDefaults();
});

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);

if (typeof globalThis !== 'undefined' && globalThis.__CHAT_SIGNAL_RADAR_TEST__ === true) {
  globalThis.ChatSignalRadarOptions = {
    DEFAULT_SETTINGS,
    updateDisplays,
    setInputValues,
    getInputValues,
    loadSettings,
    saveSettings,
    resetToDefaults
  };
}
