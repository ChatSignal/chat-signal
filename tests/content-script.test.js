import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalTestFlag = globalThis.__CHAT_SIGNAL_RADAR_TEST__;

async function loadContentScript(hostname, querySelector = () => null) {
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
  globalThis.window = {
    location: {
      hostname,
      href: `https://${hostname}/`
    }
  };
  globalThis.document = {
    readyState: 'complete',
    addEventListener: () => {},
    querySelector
  };

  await import(`../extension/content-script.js?host=${hostname}-${Date.now()}`);
  return globalThis.ChatSignalRadarContent;
}

function restoreGlobals() {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = originalTestFlag;
}

describe('content-script helpers', () => {
  it('extracts YouTube chat messages with author and text', async () => {
    const helpers = await loadContentScript('www.youtube.com');
    const authorElement = { textContent: ' NightOwl_77 ' };
    const messageElement = { textContent: ' That clutch was unreal!' };
    const element = {
      querySelector: (selector) => {
        if (selector === '#author-name') return authorElement;
        if (selector === '#message') return messageElement;
        return null;
      }
    };

    const result = helpers.extractYouTubeMessage(element);

    assert.equal(result.author, 'NightOwl_77');
    assert.equal(result.text, 'That clutch was unreal!');
    assert.equal(typeof result.timestamp, 'number');
    restoreGlobals();
  });

  it('returns null for incomplete Twitch messages', async () => {
    const helpers = await loadContentScript('www.twitch.tv');
    const element = {
      querySelector: () => null
    };

    const result = helpers.extractTwitchMessage(element);

    assert.equal(result, null);
    restoreGlobals();
  });

  it('finds Twitch chat container using the expected selector', async () => {
    const container = { id: 'twitch-chat' };
    const helpers = await loadContentScript('www.twitch.tv', (selector) => {
      if (selector === '.chat-scrollable-area__message-container') {
        return container;
      }
      return null;
    });

    assert.equal(helpers.findChatContainer(), container);
    restoreGlobals();
  });
});
