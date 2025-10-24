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
**TASK:** Act as an expert Search Analyst and Linguist. Your task is to generate a concise list of high-impact keywords and phrases that would most likely appear in the **URL slug**, **HTML page title**, and **meta description** of a website that focuses on the **TOPIC**.

**TOPIC:** ${topic}

**INSTRUCTIONS & CONSTRAINTS :**
1.  **Format:** Output an array of strings. Do NOT include any numbering, prose, or introductory/explanatory sentences.
2.  **Focus:** The terms must directly indicate the TOPIC.
3.  **Redundancy:** Do NOT include phrases that contain another shorter keyword already in the list. (e.g., if you list "cat," do not also list "cat toy").
4.  **Inflection/Plurals:** For head terms, include **both** the singular and plural forms if they are common search terms. For longer phrases, use the most natural form.
5.  **Quantity:** Generate between 10 and 15 unique, high-utility keywords/phrases.

**KEYWORD CRITERIA (Generate terms for these categories):**
* **Topic Head Terms (Short, singular AND plural):** The most essential, 1-2 word terms.
* **Specific Entity Terms:** Names of common items or practices within the topic.
* **Action/Intent Terms (Longer):** Phrases that suggest related content.
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
**TASK:** Review a block of text and identify which sentences **DIRECTLY DISCUSS** the **TOPIC**.

**TOPIC:** ${topic}

**INSTRUCTIONS & OUTPUT FORMAT:**

If the TOPIC has more than one meaning, use the most common meaning. Do not change your understanding of the TOPIC based on the context of the sentences.
For each sentence, first check **RELEVANCE to the TOPIC**. If not relevant, **Output false immediately**. 
If relevant, evaluate if it meets the **HIGH THRESHOLD** of explicit discussion about the TOPIC.

1.  **REASONING:** State clearly whether the sentence is RELEVANT or IRRELEVANT to the TOPIC. If relevant, state whether it meets the HIGH THRESHOLD.
2.  **OUTPUT:** Provide the final decision (true or false).

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
