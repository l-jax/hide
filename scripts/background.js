import { checkKeywords, extractKeywords } from "./keywords.js";

chrome.tabs.onActivated.addListener((activeInfo) => {
  checkKeywords(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
  checkKeywords(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);
  if (message.action === "closeTab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }

  if (message.action === "hideTopic" && typeof message.topic === "string") {
    console.log("Generating keywords for:", message.topic);
    extractKeywords(message.topic);
    sendResponse({ success: true });
    return true;
  }
});
