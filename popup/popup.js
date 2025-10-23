/* Utilities */

/**
 * Queries the active tab and executes a callback with the tab object.
 * @param {Function} callback - The callback to execute with the active tab.
 */
function queryActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      callback(tabs[0]);
    } else {
      console.error("No active tab found");
    }
  });
}

/**
 * Sends a message to the content script of the active tab.
 * @param {Object} tab - The active tab object.
 * @param {Object} message - The message to send.
 * @param {Function} [callback] - Optional callback to execute after the message is sent.
 */
function sendMessageToTab(tab, message, callback) {
  chrome.tabs.sendMessage(tab.id, message, function (response) {
    if (chrome.runtime.lastError) {
      console.error("Error sending message:", chrome.runtime.lastError.message);
    }
    if (callback) callback(response);
  });
}

/**
 * Sends a message to the background script.
 * @param {Object} message - The message to send.
 * @param {Function} [callback] - Optional callback to execute after the message is sent.
 */
function sendMessageToBackground(message, callback) {
  console.log("Sending message to background script:", message);
  chrome.runtime.sendMessage(message, function (response) {
    if (chrome.runtime.lastError) {
      console.error(
        "Error sending message to background script:",
        chrome.runtime.lastError.message
      );
    } else {
      console.log("Background script response:", response);
    }
    if (callback) callback(response);
  });
}

/* Event Handlers */

/**
 * Handles the form submission to hide a topic and generate keywords.
 */
function handleFormSubmit() {
  const topicForm = document.getElementById("topicForm");
  const topicInput = document.getElementById("topic");

  if (topicForm && topicInput) {
    topicForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const topic = topicInput.value.trim();
      if (!topic) return;

      sendMessageToBackground({ action: "storeTopic", topic }, () => {
        console.log("Topic stored:", topic);
      });
    });
  }
}

/**
 * Updates the stored content display with removable keywords.
 */
function displayStoredContent() {
  const topicInput = document.getElementById("topic");

  if (!topicInput) return;

  chrome.storage.local.get(["topic", "keywords"], (result) => {
    const { topic, keywords } = result;

    topicInput.value = topic || "";

    const storedKeywordsContainer = document.getElementById("storedKeywords");
    if (!storedKeywordsContainer) return;

    storedKeywordsContainer.innerHTML = "";

    if (keywords && keywords.length > 0) {
      keywords.forEach((keyword, index) => {
        const keywordElement = document.createElement("span");
        keywordElement.className = "keyword-item";
        keywordElement.textContent = keyword;

        keywordElement.addEventListener("click", () => {
          removeKeyword(index);
        });

        storedKeywordsContainer.appendChild(keywordElement);
      });
    } else {
      storedKeywordsContainer.textContent = "None";
    }
  });
}

/**
 * Removes a keyword from storage by index.
 * @param {number} index - The index of the keyword to remove.
 */
function removeKeyword(index) {
  chrome.storage.local.get(["keywords"], (result) => {
    const { keywords } = result;

    if (keywords && keywords.length > index) {
      keywords.splice(index, 1);
      chrome.storage.local.set({ keywords }, () => {
        displayStoredContent();
      });
    }
  });
}

/* Initialization */

/**
 * Initializes the popup by setting up event listeners and updating the UI.
 */
function initializePopup() {
  handleFormSubmit();
  displayStoredContent();
}

document.addEventListener("DOMContentLoaded", initializePopup);
