import { runPrompt } from "./model.js";

/* Constants */
const ERROR_MESSAGES = {
  INVALID_TOPIC: "Invalid topic provided for keyword extraction",
  CENSOR_ERROR: "Error censoring sentences",
};

/* Keyword Extraction */

/**
 * Extracts keywords for the given topic.
 * @param {string} topic - The topic to extract keywords for.
 * @returns {Promise<string[]>} - A promise that resolves to an array of keywords.
 */
export async function extractKeywords(topic) {
  console.log("Extracting keywords for topic:", topic);

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error(ERROR_MESSAGES.INVALID_TOPIC, topic);
    return [];
  }

  const prompt = `Generate keywords that could be used in the titles and headings of websites discussing the following topic: ${topic}`;
  const schema = {
    type: "object",
    properties: {
      keywords: { type: "array", items: { type: "string" } },
    },
  };

  try {
    const result = await runPrompt(prompt, schema);
    const keywords = result.keywords || [];
    chrome.storage.local.set({ keywords });
    console.log("Extracted keywords:", keywords);
    return keywords;
  } catch (error) {
    console.error("Error extracting keywords:", error);
    return [];
  }
}

/**
 * Checks if the current tab's title or URL matches any stored keywords.
 * @param {number} tabId - The ID of the tab to check.
 */
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

/* Text Processing */

/**
 * Censors sentences in the given text based on the topic.
 * @param {string} text - The text to process.
 * @param {string} topic - The topic to censor.
 * @returns {Promise<Object[]>} - A promise that resolves to an array of sentences with censorship information.
 */
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
    const censoredIndices = new Set(results);

    console.log("Censoring result for sentences:", censoredIndices);

    return sentences.map((s, i) => ({
      ...s,
      censored: censoredIndices.has(i),
    }));
  } catch (error) {
    console.error(ERROR_MESSAGES.CENSOR_ERROR, error);
    return sentences.map((s) => ({
      text: s.text,
      censored: false,
    }));
  }
}

/* Utility Functions */

/**
 * Builds a prompt for the language model to determine which sentences discuss the topic.
 * @param {Object[]} sentences - The sentences to analyze.
 * @param {string} topic - The topic to check against.
 * @returns {string} - The generated prompt.
 */
function buildPrompt(sentences, topic) {
  const header = `
For each sentence below, determine if it discusses the topic "${topic}".
Focus on the "Text" and think about the overall meaning. Use the "Context" to clarify ambiguous cases.
Return a JSON array of the indices of sentences that discuss the topic.
`;

  const body = sentences
    .map(
      (s, i) => `Sentence ${i}:
Text: ${s.text}
Context: ${s.context}`
    )
    .join("\n\n");

  return `${header}\n${body}`;
}

/**
 * Splits text into sentences and adds context for each sentence.
 * @param {string} text - The text to split.
 * @param {number} [contextSize=1] - The number of sentences to include as context.
 * @returns {Object[]} - An array of sentence objects with context.
 */
function splitIntoSentences(text, contextSize = 1) {
  const normalized = normalizeText(text);
  const sentences = segmentSentences(normalized);

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

/**
 * Normalizes text by removing extra whitespace.
 * @param {string} text - The text to normalize.
 * @returns {string} - The normalized text.
 */
function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Segments text into sentences using the Intl.Segmenter API.
 * @param {string} text - The text to segment.
 * @returns {Object[]} - An array of sentence objects with start and end indices.
 */
function segmentSentences(text) {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  let index = 0;
  const sentences = [];

  for (const { segment } of segmenter.segment(text)) {
    const start = text.indexOf(segment, index);
    const end = start + segment.length;
    sentences.push({ text: segment, start, end });
    index = end;
  }

  return sentences;
}
