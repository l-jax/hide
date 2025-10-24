import { runPrompt } from "./model.js";

/* Constants */
const ERROR_MESSAGES = {
  INVALID_TOPIC: "Invalid topic provided for keyword extraction",
  CENSOR_ERROR: "Error censoring sentences",
};

/**
 * Extracts keywords for the given topic.
 * @param {string} topic - The topic to extract keywords for.
 * @returns {Promise<string[]>} - A promise that resolves to an array of keywords.
 */
export async function storeKeywords(topic) {
  console.log("Extracting keywords for topic:", topic);

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error(ERROR_MESSAGES.INVALID_TOPIC, topic);
    return [];
  }

  const prompt = `
**TASK:** Generate a set of keywords and phrases that would most likely appear in the **URL slug**, **HTML page title**, and **meta description** of a website that focuses on the **TOPIC**.

**TOPIC:** ${topic}

**INSTRUCTIONS & CONSTRAINTS :**
1. FOCUS: The terms must directly indicate the TOPIC.
2. REDUNDANCY: Output a set. Do NOT include duplicates or phrases that contain a shorter keyword already in the set.
3. PLURALS: For head terms, include both the singular and plural forms if they differ significantly in spelling eg. "goose" and "geese"
4. QUANTITY: Generate between 10 and 15 unique, high-utility keywords/phrases.

**KEYWORD CRITERIA**
* HEAD TERMS: The most essential, 1-2 word terms.
* SPECIFIC ENTITY TERMS: Names of common items or practices within the topic.
* ACTION/INTENT TERMS: Phrases that suggest related content.
**START GENERATION NOW:**
`;
  const schema = {
    type: "object",
    properties: {
      keywords: { type: "array", items: { type: "string" } },
    },
  };

  try {
    const result = await runPrompt(prompt, schema);
    console.log("Keyword extraction result:", result);
    const keywords = result.keywords || [];
    chrome.storage.local.set({ keywords }, () => {
      chrome.runtime.sendMessage({ action: "updateKeywords", keywords });
    });
    console.log("Extracted keywords:", keywords);
    return keywords;
  } catch (error) {
    console.error("Error extracting keywords:", error);
    return [];
  }
}

/* Text Processing */

/**
 * Censors sentences in the given text based on the topic.
 * @param {string} text - The text to process.
 * @param {string} topic - The topic to censor.
 * @returns {Promise<Object[]>} - A promise that resolves to an array of sentences with censorship information.
 */
export async function censorSentences(text) {
  const result = await chrome.storage.local.get(["topic"]);
  const topic = result.topic || "";

  console.log("Censoring sentences for topic:", topic);

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error(ERROR_MESSAGES.INVALID_TOPIC, topic);
    return [];
  }

  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const prompt = buildTopicAnalysisPrompt(sentences, topic);
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        index: { type: "integer" },
        reasoning: { type: "string" },
        output: { type: "boolean" },
      },
      required: ["index", "output"],
    },
  };

  try {
    const results = await runPrompt(prompt, schema);

    console.log("Censoring result for sentences:", results);

    const censoredMap = new Map();
    results.forEach((r) => censoredMap.set(r.index, r.output));
    return sentences.map((s, i) => {
      return {
        text: s.text,
        censored: censoredMap.get(i) || false,
      };
    });
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
 * Builds a prompt for the language model to analyze sentences for relevance to a topic.
 * @param {Object[]} sentences - The sentences to analyze.
 * @param {string} topic - The topic to check against.
 * @returns {string} - The generated prompt.
 */
function buildTopicAnalysisPrompt(sentences, topic) {
  const header = `
**TASK:** Identify sentences that **DIRECTLY DISCUSS** the **TOPIC**.

**TOPIC:** ${topic}

**INSTRUCTIONS & OUTPUT FORMAT:**

If the TOPIC has more than one meaning, use the most common meaning.
Do not change your understanding of the TOPIC based on the context of the sentence.

1. REASONING: State clearly whether the sentence is RELEVANT or IRRELEVANT to the TOPIC
2. If IRRELEVANT: output false immediately.
3. If RELEVANT: evaluate whether the sentence explicitly discusses the topic or is only tangentially related.
   - If it EXPLICITLY DISCUSSES the TOPIC, output true.
   - If it is only TANGENTIALLY RELATED, output false.

**START PROCESSING THE TEXT NOW:**
`;

  const body = sentences
    .map(
      (s, i) => `
Index: ${i}
Sentence: "${s.text}"
`
    )
    .join("\n\n");

  return `${header}\n${body}`;
}

/**
 * Splits text into sentences and adds context for each sentence.
 * @param {string} text - The text to split.
 * @param {number} [contextSize=2] - The number of sentences to include as context.
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
