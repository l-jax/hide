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
  const titleMatches = keywords.some((keyword) =>
    tab.title.toLowerCase().includes(keyword.toLowerCase())
  );
  const urlMatches = keywords.some((keyword) =>
    tab.url.toLowerCase().includes(keyword.toLowerCase())
  );

  if (titleMatches || urlMatches) {
    chrome.tabs.sendMessage(tabId, { action: "keywordsDetected", keywords });
  }
}

export async function censorSentences(text, topic) {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const prompt = buildPrompt(sentences, topic);
  const schema = {
    type: "array",
    items: { type: "integer" },
    description: "Indices of sentences that discuss the topic.",
  };

  try {
    const results = await runPrompt(prompt, schema);
    const set = new Set(results);

    return sentences.map((s, i) => ({
      ...s,
      censored: set.has(i),
    }));
  } catch (error) {
    console.error("Error censoring sentences:", error);
    return sentences.map((s) => ({
      text: s.text,
      censored: false,
    }));
  }
}

function buildPrompt(sentences, topic) {
  return `
For each sentence below, determine if it discusses the topic "${topic}".
Focus primarily on the "Sentence under test." Use the "Context" only to clarify ambiguous cases.
Return a JSON array of the indices of sentences that discuss the topic.

${sentences
  .map(
    (s, i) => `Sentence ${i}:
Sentence under test: ${s.text}
Context: ${s.context}`
  )
  .join("\n\n")}
  `;
}

function splitIntoSentences(text, contextSize = 1) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  let index = 0;
  const sentences = [];
  for (const { segment } of segmenter.segment(normalized)) {
    const start = normalized.indexOf(segment, index);
    const end = start + segment.length;
    sentences.push({ text: segment, start, end });
    index = end;
  }

  return sentences.map((sentence, i) => {
    const context = sentences.slice(
      Math.max(0, i - contextSize),
      Math.min(sentences.length, i + contextSize + 1)
    );
    return {
      ...sentence,
      context: context.map((s) => s.text).join(" "),
    };
  });
}
