export async function checkKeywords(tabId) {
  // for testing purposes, we set some keywords here
  await chrome.storage.local.set({
    keywords: ["confidential", "secret", "private"],
  });

  const { keywords } = await chrome.storage.local.get("keywords");
  const tab = await chrome.tabs.get(tabId);
  const titleMatches = keywords.some((keyword) => tab.title.includes(keyword));
  const urlMatches = keywords.some((keyword) => tab.url.includes(keyword));

  if (titleMatches || urlMatches) {
    chrome.tabs.sendMessage(tabId, { action: "keywordsDetected", keywords });
  }
}