document.addEventListener("DOMContentLoaded", function () {
  const topicForm = document.getElementById("topicForm");
  if (topicForm) {
    topicForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const topic = document.getElementById("topic").value.trim();
      if (!topic) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "hideTopic", topic });
        window.close();
      });
    });
  }

  const undoBtn = document.getElementById("undoBtn");

  function updateUndoButton() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) return;
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "queryState" },
        function (state) {
          if (!undoBtn) return;

          if (!state || (!state.hasHiddenContent && !state.overlayPresent)) {
            undoBtn.style.display = "none";
            return;
          }
          undoBtn.style.display = "";
          if (state.overlayPresent) {
            undoBtn.textContent = "Cancel";
          } else {
            undoBtn.textContent = "Undo";
          }
        }
      );
    });
  }

  if (undoBtn) {
    undoBtn.addEventListener("click", function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "undo" });
        window.close();
      });
    });
  }

  updateUndoButton();
});
