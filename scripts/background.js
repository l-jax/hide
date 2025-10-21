import { checkKeywords, extractKeywords, censorSentences } from "./text.js";

/* Constants */
const ACTIONS = {
  CLOSE_TAB: "closeTab",
  CENSOR_TEXT: "censorText",
  GENERATE_KEYWORDS: "generateKeywords",
};

/* Event Listeners */

/**
 * Listener for when a tab is activated.
 * Checks for keywords in the active tab.
 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  checkKeywords(activeInfo.tabId);
});

/**
 * Listener for when a tab is updated.
 * Checks for keywords in the updated tab.
 */
chrome.tabs.onUpdated.addListener(async (tabId) => {
  checkKeywords(tabId);
});

/**
 * Listener for runtime messages.
 * Handles various actions like censoring text, hiding topics, and closing tabs.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);

  if (!message || !message.action) {
    console.warn("Invalid message received:", message);
    return;
  }

  switch (message.action) {
    case ACTIONS.CLOSE_TAB:
      handleCloseTab(sender);
      break;

    case ACTIONS.CENSOR_TEXT:
      handleCensorText(message, sendResponse);
      return true;

    case ACTIONS.GENERATE_KEYWORDS:
      handleGenerateKeywords(message, sendResponse);
      return true;

    default:
      console.warn("Unknown action:", message.action);
  }
});

/* Message Handlers */

/**
 * Handles the "closeTab" action.
 * Closes the sender's tab.
 * @param {Object} sender - The sender of the message.
 */
function handleCloseTab(sender) {
  if (sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  } else {
    console.warn("No tab found to close for sender:", sender);
  }
}

/**
 * Handles the "censorText" action.
 * Censors text by calling the `censorSentences` function.
 * @param {Object} message - The message containing the text to censor.
 * @param {Function} sendResponse - The callback to send the response.
 */
async function handleCensorText(message, sendResponse) {
  if (typeof message.text !== "string") {
    console.error("Invalid text provided for censoring:", message.text);
    sendResponse({ success: false, error: "Invalid text" });
    return;
  }

  console.log("Censoring text for:", message.text);

  try {
    const result = await censorSentences(message.text);
    sendResponse({ success: true, result });
  } catch (error) {
    console.error("Error censoring text:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handles the "generateKeywords" action.
 * Extracts keywords for the given topic.
 * @param {Object} message - The message containing the topic.
 * @param {Function} sendResponse - The callback to send the response.
 */
function handleGenerateKeywords(message, sendResponse) {
  if (typeof message.topic !== "string" || !message.topic.trim()) {
    console.error("Invalid topic provided for generating keywords:", message.topic);
    sendResponse({ success: false, error: "Invalid topic" });
    return;
  }

  console.log("Generating keywords for:", message.topic);

  try {
    extractKeywords(message.topic);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error generating keywords:", error);
    sendResponse({ success: false, error: error.message });
  }
}
