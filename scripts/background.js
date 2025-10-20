import { checkKeywords } from "./check.js";

chrome.tabs.onActivated.addListener((activeInfo) => {
  checkKeywords(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
  checkKeywords(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "closeTab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});
