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

  it('captures every message in a burst-added subtree, not just the first', async () => {
    const helpers = await loadContentScript('www.twitch.tv');
    const selector = '.chat-line__message';
    const msgA = { id: 'a', matches: (s) => s === selector };
    const msgB = { id: 'b', matches: (s) => s === selector };
    const msgC = { id: 'c', matches: (s) => s === selector };
    // One subtree attached in a single mutation, already holding 3 messages.
    const wrapper = {
      matches: () => false,
      querySelectorAll: (s) => (s === selector ? [msgA, msgB, msgC] : [])
    };

    const result = helpers.collectMessageElements(wrapper, selector);

    assert.deepEqual(result.map((n) => n.id), ['a', 'b', 'c']);
    restoreGlobals();
  });

  it('captures a node that is itself a message', async () => {
    const helpers = await loadContentScript('www.twitch.tv');
    const selector = '.chat-line__message';
    const node = { id: 'x', matches: (s) => s === selector, querySelectorAll: () => [] };

    assert.deepEqual(helpers.collectMessageElements(node, selector).map((n) => n.id), ['x']);
    restoreGlobals();
  });

  it('ignores non-element nodes (no matches method)', async () => {
    const helpers = await loadContentScript('www.twitch.tv');
    const textNode = { nodeType: 3, textContent: 'hi' };

    assert.deepEqual(helpers.collectMessageElements(textNode, '.chat-line__message'), []);
    restoreGlobals();
  });

  it('prefers a native element id for the message id', async () => {
    const helpers = await loadContentScript('www.youtube.com');
    const el = { id: 'ChwKGkNMmsg123', getAttribute: () => null };
    assert.equal(helpers.getMessageId(el), 'ChwKGkNMmsg123');
    restoreGlobals();
  });

  it('synthesizes a stable id per element when no native id exists', async () => {
    const helpers = await loadContentScript('www.twitch.tv');
    const el1 = {};
    const el2 = {};
    const id1 = helpers.getMessageId(el1);
    assert.match(id1, /^cs-/);
    assert.equal(helpers.getMessageId(el1), id1); // stable for same element
    assert.notEqual(helpers.getMessageId(el2), id1); // distinct per element
    restoreGlobals();
  });

  it('includes an id on extracted messages', async () => {
    const helpers = await loadContentScript('www.youtube.com');
    const element = {
      id: 'msg-42',
      querySelector: (selector) => {
        if (selector === '#author-name') return { textContent: 'Ada' };
        if (selector === '#message') return { textContent: 'gg' };
        return null;
      }
    };
    assert.equal(helpers.extractYouTubeMessage(element).id, 'msg-42');
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
