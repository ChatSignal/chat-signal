// Content script for YouTube/Twitch live chat monitoring

const BATCH_INTERVAL = 5000; // 5 seconds
let messageBatch = [];

// Detect platform
const isYouTube = window.location.hostname.includes('youtube.com');
const isTwitch = window.location.hostname.includes('twitch.tv');

// YouTube chat selector
const YOUTUBE_CHAT_SELECTOR = 'yt-live-chat-text-message-renderer';
// Twitch chat selector
const TWITCH_CHAT_SELECTOR = '.chat-line__message';

function extractYouTubeMessage(element) {
  const authorElement = element.querySelector('#author-name');
  const messageElement = element.querySelector('#message');
  
  if (!authorElement || !messageElement) return null;
  
  return {
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
    text: messageElement.textContent.trim(),
    author: authorElement.textContent.trim(),
    timestamp: Date.now()
  };
}

let currentObserver = null;
let currentContainer = null;
let batchTimer = null;
let containerMonitor = null;
let lastUrl = window.location.href;

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
        platform: isYouTube ? 'youtube' : 'twitch'
      });
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
      console.warn('[Chat Signal Radar] Chat container not found after 30 seconds. Chat may not be available on this page.');
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
  if (!document.body) {
    return;
  }
  const navObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      resetObserver();
      startContainerWatcher();
    }
  });

  navObserver.observe(document.body, { childList: true, subtree: true });
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
        console.warn('[Chat Signal Radar] Unable to access YouTube chat iframe:', error);
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
  console.log(`[Chat Signal Radar] Started observing ${platform} chat`);

  currentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const messageElement = node.matches(getSelector()) ? node : node.querySelector(getSelector());
          if (messageElement) {
            const extractor = isYouTube ? extractYouTubeMessage : extractTwitchMessage;
            const message = extractor(messageElement);
            if (message) {
              messageBatch.push(message);
            }
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeChat);
} else {
  observeChat();
}
