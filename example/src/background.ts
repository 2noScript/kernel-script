// Extension service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Auto Script Extension Installed');
});

// Example of listening to messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  if (message.type === 'PING') {
    console.log('Received PING from popup');
    sendResponse({ payload: 'PONG from background' });
  }
});
