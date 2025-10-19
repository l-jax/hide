document.addEventListener("DOMContentLoaded", function () {
  const topicForm = document.getElementById("topicForm");
  const topicInput = document.getElementById("topic");
  const selHint = document.getElementById("selHint");
  const undoBtn = document.getElementById("undoBtn");

  const HINT_MESSAGES = {
    default: "what do you want to hide?",
    readyToHide: "press enter to start hiding",
    hidingInProgress: "hiding in progress",
    textHidden: "text hidden",
  };

  function updateHint(message) {
    if (selHint) {
      selHint.textContent = message;
    }
  }

  function queryActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0]) {
        callback(tabs[0]);
      } else {
        console.log("No active tab found");
      }
    });
  }

  function toggleInputVisibility(show) {
    if (topicInput) {
      topicInput.style.display = show ? "" : "none";
    }
  }

  if (topicInput) {
    topicInput.addEventListener("input", function () {
      updateHint(topicInput.value.trim() === "" ? HINT_MESSAGES.default : HINT_MESSAGES.readyToHide);
    });
  }

  if (topicForm) {
    topicForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const topic = topicInput.value.trim();
      if (!topic) return;

      queryActiveTab((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: "hideTopic", topic }, function () {
          console.log("Message sent to content script");
        });
        updateHint(HINT_MESSAGES.hidingInProgress);
        toggleInputVisibility(false);
        window.close();
      });
    });
  }

  function updateUndoButton() {
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: "queryState" }, function (state) {
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

  if (undoBtn) {
    undoBtn.addEventListener("click", function () {
      queryActiveTab((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: "undo" }, function () {
          updateHint(HINT_MESSAGES.default);
          updateUndoButton();
        });
        window.close();
      });
    });
  }

  updateUndoButton();
});
