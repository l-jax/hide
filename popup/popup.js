document.addEventListener("DOMContentLoaded", function () {
  const topicForm = document.getElementById("topicForm");
  if (topicForm) {
    topicForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const topic = document.getElementById("topic").value.trim();
      if (!topic) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "hideTopic", topic });
      });
    });
  }
});
