/* Utilities */

/**
 * Creates a keyword element with a remove button.
 * @param {string} keyword - The keyword text.
 * @param {number} index - The index of the keyword.
 * @param {Function} removeCallback - The callback to remove the keyword.
 * @returns {HTMLElement} - The keyword element.
 */
function createKeywordElement(keyword, index, removeCallback) {
  const keywordElement = document.createElement("span");
  keywordElement.className = "hide-keyword-item";
  keywordElement.textContent = keyword;
  keywordElement.addEventListener("click", () => removeCallback(index));
  return keywordElement;
}

/**
 * Updates the keyword container with the provided keywords.
 * @param {HTMLElement} container - The container element.
 * @param {string[]} keywords - The list of keywords.
 * @param {Function} removeCallback - The callback to remove a keyword.
 */
function updateKeywordContainer(container, keywords, removeCallback) {
  container.classList.remove("hide-loading");
  container.innerHTML = "";

  if (keywords.length > 0) {
    keywords.forEach((keyword, index) => {
      const keywordElement = createKeywordElement(
        keyword,
        index,
        removeCallback
      );
      container.appendChild(keywordElement);
    });
  } else {
    container.textContent = "No keywords generated.";
  }
}

/**
 * Handles errors during keyword generation.
 * @param {HTMLElement} container - The container element.
 * @param {string} errorMessage - The error message to display.
 */
function handleKeywordError(container, errorMessage) {
  console.error(errorMessage);
  container.classList.remove("hide-loading");
  container.innerHTML = `<p>${errorMessage}</p>`;
}

/* Event Handlers */

function handleFormSubmit() {
  const topicForm = document.getElementById("topicForm");
  const topicInput = document.getElementById("topic");
  const storedKeywordsContainer = document.getElementById("storedKeywords");

  if (topicForm && topicInput) {
    topicForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const topic = topicInput.value.trim();
      if (!topic) return;

      storedKeywordsContainer.innerHTML = "<p>Loading keywords...</p>";
      storedKeywordsContainer.classList.add("hide-loading");

      chrome.runtime.sendMessage({ action: "storeTopic", topic }, () => {
        if (chrome.runtime.lastError) {
          handleKeywordError(
            storedKeywordsContainer,
            "Error generating keywords. Please try again."
          );
          return;
        }

        console.log(
          "Message sent to background script. Waiting for callback..."
        );
      });
    });

    chrome.runtime.onMessage.addListener(function listener(message) {
      if (message.action === "updateKeywords" && message.keywords) {
        chrome.runtime.onMessage.removeListener(listener);
        updateKeywordContainer(
          storedKeywordsContainer,
          message.keywords,
          removeKeyword
        );
      }
    });
  }
}

function displayStoredContent() {
  const topicInput = document.getElementById("topic");

  if (!topicInput) return;

  chrome.storage.local.get(["topic", "keywords"], (result) => {
    const { topic, keywords } = result;

    topicInput.value = topic || "";

    const storedKeywordsContainer = document.getElementById("storedKeywords");
    if (!storedKeywordsContainer) return;

    updateKeywordContainer(
      storedKeywordsContainer,
      keywords || [],
      removeKeyword
    );
  });
}

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

function initializePopup() {
  handleFormSubmit();
  displayStoredContent();
}

document.addEventListener("DOMContentLoaded", initializePopup);
