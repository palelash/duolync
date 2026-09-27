/**
 * Duolync Chrome Extension – Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Relay messages between popup and content scripts when needed
 * - Handle any future background tasks (e.g. auth token refresh)
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    console.log("[Duolync] Extension installed. Ready to save creators.");
  }
});

/**
 * Generic message relay: popup → background → content script (if needed).
 * Currently the popup communicates directly with the content script via
 * chrome.tabs.sendMessage, so this listener is a lightweight extension point
 * for future features (e.g. auth, queuing, background saves).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DUOLYNC_PING") {
    sendResponse({ alive: true });
  }
  return false;
});
