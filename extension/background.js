// Background service worker for Chrome extension

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Relay messages from content script to side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT_MESSAGES') {
    // Trust boundary: only relay chat that originates from one of THIS
    // extension's own content scripts running in a tab. Drops anything with a
    // foreign sender id or no tab (e.g. a re-broadcast, or a spoofed message).
    if (sender.id !== chrome.runtime.id || !sender.tab) {
      return false;
    }

    // Stamp the source window/tab so each side panel can keep only its own
    // window's stream (two streams in two windows no longer merge).
    chrome.runtime.sendMessage({
      ...message,
      sourceWindowId: sender.tab.windowId,
      sourceTabId: sender.tab.id,
    }).catch(() => {
      // Side panel may not be open, that's okay
    });
  }
  return false;
});
