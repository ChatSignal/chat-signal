import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const originalDocument = globalThis.document;
const originalChrome = globalThis.chrome;
const originalTestFlag = globalThis.__CHAT_SIGNAL_RADAR_TEST__;

function createElement(initial = {}) {
  const el = {
    _value: String(initial.value ?? ''),
    checked: initial.checked ?? false,
    disabled: initial.disabled ?? false,
    textContent: '',
    className: '',
    classList: {
      _classes: new Set(),
      add(...names) { names.forEach(n => this._classes.add(n)); },
      remove(...names) { names.forEach(n => this._classes.delete(n)); },
      contains(name) { return this._classes.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (this._classes.has(name)) this._classes.delete(name);
          else this._classes.add(name);
        } else if (force) {
          this._classes.add(name);
        } else {
          this._classes.delete(name);
        }
      }
    },
    addEventListener: () => {},
    closest: () => ({ appendChild: () => {} })
  };
  // Mimic real DOM: input.value always coerces to string
  Object.defineProperty(el, 'value', {
    get() { return el._value; },
    set(v) { el._value = String(v); },
    enumerable: true,
    configurable: true
  });
  return el;
}

function setupOptionsDom() {
  const elements = {
    'settings-form': createElement(),
    'reset-btn': createElement(),
    'save-btn': createElement(),
    'status': createElement(),
    'topic-min-count': createElement(),
    'spam-threshold': createElement(),
    'duplicate-window': createElement(),
    'sentiment-sensitivity': createElement(),
    'mood-upgrade-threshold': createElement(),
    'analysis-window-size': createElement(),
    'inactivity-timeout': createElement(),
    'ai-summaries-toggle': createElement({ checked: false }),
    'topic-min-count-value': createElement(),
    'spam-threshold-value': createElement(),
    'duplicate-window-value': createElement(),
    'sentiment-sensitivity-value': createElement(),
    'mood-upgrade-threshold-value': createElement(),
    'analysis-window-size-value': createElement(),
    'analysis-window-size-estimate': createElement(),
    'analysis-window-warning': createElement(),
    'inactivity-timeout-value': createElement(),
    'encoder-backend-value': createElement(),
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || createElement(),
    addEventListener: () => {},
    querySelectorAll: () => []
  };

  const storageState = { settings: null };

  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({ settings: storageState.settings }),
        set: async ({ settings }) => {
          storageState.settings = settings;
        }
      },
      local: {
        get: async () => ({})
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
      analysisWindowSize: 500,
      inactivityTimeout: 120,
      aiSummariesEnabled: true
    };

    helpers.setInputValues(settings);

    assert.equal(elements['topic-min-count'].value, '2');
    assert.equal(elements['spam-threshold'].value, '4');
    assert.equal(elements['duplicate-window'].value, '45');
    assert.equal(elements['sentiment-sensitivity'].value, '1');
    assert.equal(elements['mood-upgrade-threshold'].value, '25');
    assert.equal(elements['analysis-window-size'].value, '500');
    assert.equal(elements['inactivity-timeout'].value, '120');
    assert.equal(elements['ai-summaries-toggle'].checked, true);

    // getInputValues returns only numeric settings (aiSummariesEnabled is handled separately)
    const readValues = helpers.getInputValues();
    assert.deepEqual(readValues, {
      topicMinCount: 2,
      spamThreshold: 4,
      duplicateWindow: 45,
      sentimentSensitivity: 1,
      moodUpgradeThreshold: 25,
      analysisWindowSize: 500,
      inactivityTimeout: 120
    });

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
    elements['analysis-window-size'].value = '200';
    elements['inactivity-timeout'].value = '60';

    await helpers.saveSettings();

    assert.deepEqual(storageState.settings, {
      topicMinCount: 7,
      spamThreshold: 2,
      duplicateWindow: 15,
      sentimentSensitivity: 2,
      moodUpgradeThreshold: 18,
      analysisWindowSize: 200,
      inactivityTimeout: 60
    });

    restoreGlobals();
  });
});
