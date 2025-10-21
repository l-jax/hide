import { checkKeywords, extractKeywords, censorSentences } from "./keywords.js";

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

  if (message.action === "censorText" && typeof message.text === "string") {
    console.log("Censoring text for:", message.text);

    (async () => {
      try {
        const result = await censorSentences(message.text);
        sendResponse({ success: true, result });
      } catch (error) {
        console.error("Error censoring text:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message.action === "hideTopic" && typeof message.topic === "string") {
    console.log("Generating keywords for:", message.topic);
    extractKeywords(message.topic);
    sendResponse({ success: true });
    return true;
  }
});
