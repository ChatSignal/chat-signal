// Content script for YouTube/Twitch live chat monitoring

const DEBUG = false;
const BATCH_INTERVAL = 5000; // 5 seconds
let messageBatch = [];

const isTestEnv = typeof globalThis !== 'undefined' && globalThis.__CHAT_SIGNAL_RADAR_TEST__ === true;

// Detect platform
const isYouTube = window.location.hostname.includes('youtube.com');
const isTwitch = window.location.hostname.includes('twitch.tv');

// YouTube chat selector
const YOUTUBE_CHAT_SELECTOR = 'yt-live-chat-text-message-renderer';
// Twitch chat selector
const TWITCH_CHAT_SELECTOR = '.chat-line__message';

// Stable per-message id machinery. Foundation for future moderation/deletion
// handling — nothing consumes `id` yet. Prefer the platform's native element
// id (YouTube renderers carry one); otherwise synthesize a stable id and cache
// it against the element via a WeakMap, so a later deletion handler can
// correlate an attribute mutation on that same element back to this message.
// A WeakMap keeps this off the page DOM and lets entries GC when the element
// is pruned by the chat's virtualized list.
let messageIdCounter = 0;
const messageIdCache = new WeakMap();

function getMessageId(element) {
  if (!element || typeof element !== 'object') return null;
  const nativeId = element.id
    || (typeof element.getAttribute === 'function' && element.getAttribute('id'))
    || null;
  if (nativeId) return nativeId;
  if (messageIdCache.has(element)) return messageIdCache.get(element);
  const id = `cs-${Date.now().toString(36)}-${(messageIdCounter++).toString(36)}`;
  messageIdCache.set(element, id);
  return id;
}

function extractYouTubeMessage(element) {
  const authorElement = element.querySelector('#author-name');
  const messageElement = element.querySelector('#message');

  if (!authorElement || !messageElement) return null;

  return {
    id: getMessageId(element),
    text: messageElement.textContent.trim(),
    author: authorElement.textContent.trim(),
    timestamp: Date.now()
  };
}

function extractTwitchMessage(element) {
  const authorElement = element.querySelector('.chat-author__display-name');
  const messageElement = element.querySelector('.text-fragment');

  if (!authorElement || !messageElement) return null;

  return {
    id: getMessageId(element),
    text: messageElement.textContent.trim(),
    author: authorElement.textContent.trim(),
    timestamp: Date.now()
  };
}

// Collect every chat-message element inside a single added subtree.
// A burst insert can attach one subtree that already contains multiple
// messages, so we must gather ALL matches — returning only the first
// (querySelector) silently drops the rest during fast chats.
function collectMessageElements(node, selector) {
  if (!node || typeof node.matches !== 'function') return [];
  if (node.matches(selector)) return [node];
  return Array.from(node.querySelectorAll(selector));
}

let currentObserver = null;
let currentContainer = null;
let batchTimer = null;
let containerMonitor = null;
let lastUrl = window.location.href;
let navObserver = null;

function observeChat() {
  startBatchTimer();
  startContainerWatcher();
  startNavigationWatcher();
  startContainerMonitor();
}

function startBatchTimer() {
  if (batchTimer) {
    return;
  }

  batchTimer = setInterval(() => {
    if (messageBatch.length > 0) {
      chrome.runtime.sendMessage({
        type: 'CHAT_MESSAGES',
        messages: messageBatch,
        platform: isYouTube ? 'youtube' : 'twitch',
        streamUrl: window.location.href,
        streamTitle: document.title
      }).catch(() => {}); // Side panel may be closed
      messageBatch = [];
    }
  }, BATCH_INTERVAL);
}

function startContainerWatcher() {
  const MAX_RETRIES = 30; // 30 seconds
  let retryCount = 0;

  const checkForChat = setInterval(() => {
    retryCount++;
    const nextContainer = findChatContainer();

    if (nextContainer && nextContainer !== currentContainer) {
      clearInterval(checkForChat);
      attachObserver(nextContainer);
    } else if (retryCount >= MAX_RETRIES) {
      clearInterval(checkForChat);
      console.warn('[Chat Signal] Chat container not found after 30 seconds. Chat may not be available on this page.');
    }
  }, 1000);
}

function startContainerMonitor() {
  if (containerMonitor) {
    return;
  }

  containerMonitor = setInterval(() => {
    if (!currentContainer) {
      return;
    }
    const ownerDoc = currentContainer.ownerDocument || document;
    const stillPresent = ownerDoc.contains(currentContainer);
    if (!stillPresent) {
      resetObserver();
      startContainerWatcher();
    }
  }, 5000);
}

function startNavigationWatcher() {
  if (navObserver) return;
  navObserver = true; // guard against double-init

  function onNavigate() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      resetObserver();
      startContainerWatcher();
    }
  }

  // Intercept SPA navigations (YouTube uses pushState/replaceState)
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    onNavigate();
  };
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

function findChatContainer() {
  if (isYouTube) {
    const iframe = document.querySelector('iframe#chatframe');
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc) {
          return iframeDoc.querySelector('#items');
        }
      } catch (error) {
        if (DEBUG) console.warn('[Chat Signal] Unable to access YouTube chat iframe:', error);
      }
    }
    return document.querySelector('yt-live-chat-item-list-renderer #items');
  }

  if (isTwitch) {
    return document.querySelector('.chat-scrollable-area__message-container');
  }

  return null;
}

function attachObserver(container) {
  resetObserver();
  currentContainer = container;
  const platform = isYouTube ? 'YouTube' : 'Twitch';
  if (DEBUG) console.log(`[Chat Signal] Started observing ${platform} chat`);

  currentObserver = new MutationObserver((mutations) => {
    const extractor = isYouTube ? extractYouTubeMessage : extractTwitchMessage;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        // Capture every message in the subtree, not just the first.
        for (const messageElement of collectMessageElements(node, getSelector())) {
          const message = extractor(messageElement);
          if (message) {
            messageBatch.push(message);
          }
        }
      });
    });
  });

  currentObserver.observe(container, {
    childList: true,
    subtree: true
  });
}

function resetObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  currentContainer = null;
}

function getSelector() {
  return isYouTube ? YOUTUBE_CHAT_SELECTOR : TWITCH_CHAT_SELECTOR;
}

// Start observing when DOM is ready
if (!isTestEnv) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeChat);
  } else {
    observeChat();
  }
}

const ChatSignalRadarContent = {
  extractYouTubeMessage,
  extractTwitchMessage,
  collectMessageElements,
  getMessageId,
  getSelector,
  findChatContainer
};

if (typeof globalThis !== 'undefined') {
  globalThis.ChatSignalRadarContent = ChatSignalRadarContent;
}
