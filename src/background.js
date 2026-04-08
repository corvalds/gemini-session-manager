/**
 * Gemini Session Manager - Background Service Worker
 *
 * Handles extension lifecycle events.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Gemini Session Manager installed');
});
