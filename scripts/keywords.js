import { runPrompt } from "./model.js";

export async function extractKeywords(topic) {
  console.log("Extracting keywords for topic:", topic);
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error("Invalid topic provided for keyword extraction", topic);
    return [];
  }

  const prompt = `Generate keywords that could be used in the titles and headings of websites discussing the following topic: ${topic}`;
  const schema = {
    type: "object",
    properties: {
      keywords: { type: "array", items: { type: "string" } },
    },
  };
  const result = await runPrompt(prompt, schema);
  chrome.storage.local.set({ keywords: result.keywords || [] });
  console.log("Extracted keywords:", result.keywords);
  return result.keywords || [];
}

export async function checkKeywords(tabId) {
  const { keywords } = await chrome.storage.local.get("keywords");
  const tab = await chrome.tabs.get(tabId);
  const titleMatches = keywords.some((keyword) => tab.title.toLowerCase().includes(keyword.toLowerCase()));
  const urlMatches = keywords.some((keyword) => tab.url.toLowerCase().includes(keyword.toLowerCase()));

  if (titleMatches || urlMatches) {
    chrome.tabs.sendMessage(tabId, { action: "keywordsDetected", keywords });
  }
}
