import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const originalDocument = globalThis.document;
const originalChrome = globalThis.chrome;
const originalTestFlag = globalThis.__CHAT_SIGNAL_RADAR_TEST__;

function createElement(initial = {}) {
  return {
    value: initial.value ?? '',
    checked: initial.checked ?? false,
    textContent: '',
    className: '',
    classList: {
      add: () => {},
      remove: () => {}
    },
    addEventListener: () => {}
  };
}

function setupOptionsDom() {
  const elements = {
    'settings-form': createElement(),
    'reset-btn': createElement(),
    'status': createElement(),
    'topic-min-count': createElement(),
    'spam-threshold': createElement(),
    'duplicate-window': createElement(),
    'sentiment-sensitivity': createElement(),
    'mood-upgrade-threshold': createElement(),
    'ai-summaries-enabled': createElement({ checked: false }),
    'topic-min-count-value': createElement(),
    'spam-threshold-value': createElement(),
    'duplicate-window-value': createElement(),
    'sentiment-sensitivity-value': createElement(),
    'mood-upgrade-threshold-value': createElement()
  };

  globalThis.document = {
    getElementById: (id) => elements[id],
    addEventListener: () => {}
  };

  const storageState = { settings: null };

  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({ settings: storageState.settings }),
        set: async ({ settings }) => {
          storageState.settings = settings;
        }
      }
    }
  };

  return { elements, storageState };
}

function restoreGlobals() {
  globalThis.document = originalDocument;
  globalThis.chrome = originalChrome;
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = originalTestFlag;
}

describe('options helpers', () => {
  it('sets and reads input values for settings', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const { elements } = setupOptionsDom();

    await import(`../extension/options/options.js?test=${Date.now()}`);

    const helpers = globalThis.ChatSignalRadarOptions;
    const settings = {
      topicMinCount: 2,
      spamThreshold: 4,
      duplicateWindow: 45,
      sentimentSensitivity: 1,
      moodUpgradeThreshold: 25,
      aiSummariesEnabled: true
    };

    helpers.setInputValues(settings);

    assert.equal(elements['topic-min-count'].value, '2');
    assert.equal(elements['spam-threshold'].value, '4');
    assert.equal(elements['duplicate-window'].value, '45');
    assert.equal(elements['sentiment-sensitivity'].value, '1');
    assert.equal(elements['mood-upgrade-threshold'].value, '25');
    assert.equal(elements['ai-summaries-enabled'].checked, true);

    const readValues = helpers.getInputValues();
    assert.deepEqual(readValues, settings);

    restoreGlobals();
  });

  it('persists settings through chrome.storage sync', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const { elements, storageState } = setupOptionsDom();

    await import(`../extension/options/options.js?test=${Date.now()}`);
    const helpers = globalThis.ChatSignalRadarOptions;

    elements['topic-min-count'].value = '7';
    elements['spam-threshold'].value = '2';
    elements['duplicate-window'].value = '15';
    elements['sentiment-sensitivity'].value = '2';
    elements['mood-upgrade-threshold'].value = '18';
    elements['ai-summaries-enabled'].checked = true;

    await helpers.saveSettings();

    assert.deepEqual(storageState.settings, {
      topicMinCount: 7,
      spamThreshold: 2,
      duplicateWindow: 15,
      sentimentSensitivity: 2,
      moodUpgradeThreshold: 18,
      aiSummariesEnabled: true
    });

    restoreGlobals();
  });
});
