/* Constants */
const HINT_MESSAGES = {
  default: "what do you want to hide?",
  readyToHide: "press enter to start hiding",
  hidingInProgress: "hiding in progress",
  textHidden: "text hidden",
};

const ACTIONS = {
  HIDE_TOPIC: "hideTopic",
  UNDO: "undo",
  QUERY_STATE: "queryState",
  STORE_TOPIC: "storeTopic",
};

/* Utilities */

/**
 * Updates the hint message displayed in the popup.
 * @param {string} message - The message to display.
 */
function updateHint(message) {
  const selHint = document.getElementById("selHint");
  if (selHint) {
    selHint.textContent = message;
  }
}

/**
 * Toggles the visibility of the topic input field.
 * @param {boolean} show - Whether to show the input field.
 */
function toggleInputVisibility(show) {
  const topicInput = document.getElementById("topic");
  if (topicInput) {
    topicInput.style.display = show ? "" : "none";
  }
}

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

      sendMessageToBackground({ action: ACTIONS.STORE_TOPIC, topic }, () => {
        console.log("Topic stored:", topic);
      });

      queryActiveTab((tab) => {
        sendMessageToTab(tab, { action: ACTIONS.HIDE_TOPIC, topic }, () => {
          console.log("Message sent to content script");
        });

        updateHint(HINT_MESSAGES.hidingInProgress);
        toggleInputVisibility(false);
        window.close();
      });
    });
  }
}

/**
 * Updates the undo button based on the current state of the content script.
 */
function updateUndoButton() {
  const undoBtn = document.getElementById("undoBtn");

  queryActiveTab((tab) => {
    sendMessageToTab(tab, { action: ACTIONS.QUERY_STATE }, (state) => {
      if (!undoBtn) return;

      if (state && state.overlayPresent) {
        undoBtn.style.display = "";
        undoBtn.textContent = "Cancel";
        updateHint(HINT_MESSAGES.hidingInProgress);
        toggleInputVisibility(false);
      } else if (state && state.hasHiddenContent) {
        undoBtn.style.display = "";
        undoBtn.textContent = "Undo";
        updateHint(HINT_MESSAGES.textHidden);
        toggleInputVisibility(false);
      } else {
        undoBtn.style.display = "none";
        updateHint(HINT_MESSAGES.default);
        toggleInputVisibility(true);
      }
    });
  });
}

/**
 * Handles the undo button click event.
 */
function handleUndoButtonClick() {
  const undoBtn = document.getElementById("undoBtn");

  if (undoBtn) {
    undoBtn.addEventListener("click", function () {
      queryActiveTab((tab) => {
        sendMessageToTab(tab, { action: ACTIONS.UNDO }, () => {
          updateHint(HINT_MESSAGES.default);
          updateUndoButton();
        });
        window.close();
      });
    });
  }
}

/**
 * Updates the stored content display in the popup.
 */
function displayStoredContent() {
  const storedTopic = document.getElementById("storedTopic");
  const storedKeywords = document.getElementById("storedKeywords");

  if (!storedTopic || !storedKeywords) return;

  chrome.storage.local.get(["topic", "keywords"], (result) => {
    const { topic, keywords } = result;

    storedTopic.textContent = `Topic: ${topic || "None"}`;
    storedKeywords.textContent = `Keywords: ${
      keywords ? keywords.join(", ") : "None"
    }`;
  });
}

/* Initialization */

/**
 * Initializes the popup by setting up event listeners and updating the UI.
 */
function initializePopup() {
  handleFormSubmit();
  handleUndoButtonClick();
  updateUndoButton();
  displayStoredContent();
}

document.addEventListener("DOMContentLoaded", initializePopup);
