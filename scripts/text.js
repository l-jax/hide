import { runPrompt } from "./model.js";
import { generateSummary } from "./summarizer.js";

/* Constants */
const ERROR_MESSAGES = {
  INVALID_TOPIC: "Invalid topic provided for keyword extraction",
  CENSOR_ERROR: "Error censoring sentences",
};

/**
 * Generates summary for the given topic.
 * @param {string} topic - The topic to generate a summary for.
 * @returns {Promise<string>} - A promise that resolves to the generated summary.
 */
export async function storeSummary(topic) {
  console.log("Generating summary for topic:", topic);
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error(ERROR_MESSAGES.INVALID_TOPIC, topic);
    return "";
  }

  // todo: generate summary from topic
  chrome.storage.local.set({ topic: topic });

  return topic;
}

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
**TASK:** Act as an expert Search Analyst. Your task is to generate a concise list of high-impact keywords and phrases that would most likely appear in the **URL slug** or **HTML page title** of a website that focuses on the **SENSITIVE TOPIC**.

**SENSITIVE TOPIC:** ${topic}

**INSTRUCTIONS & CONSTRAINTS:**
1.  **Format:** Output only an array of keywords/phrases. Do NOT include any numbering, prose, or introductory/explanatory sentences.
2.  **Focus:** The terms must be specific enough to directly indicate the SENSITIVE TOPIC.
3.  **Utility:** Terms must be suitable for use in a search query to identify relevant websites
4.  **Quantity:** Generate between 10 and 15 keywords/phrases.

**KEYWORD CRITERIA (Generate terms for these categories):**
* **Topic Head Terms (Short):** The most essential, 1-2 word terms.
* **Specific Entity Terms:** Names of common items or practices within the topic.
* **Action/Intent Terms (Longer):** Phrases that suggest related content.
* **Combinations:** Terms combining the topic with related concepts or qualifiers.
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
**TASK:** Review a block of text and identify which sentences must be **FLAGGED** (Output true) because they provide specific, actionable detail **DIRECTLY ABOUT** the **SENSITIVE TOPIC**.

**SENSITIVE TOPIC:** ${topic}

**HIGH THRESHOLD DEFINITION:** A sentence must be flagged (Output true) **IF AND ONLY IF** it meets *both* of the following conditions:
1.  It is **directly relevant** to the **SENSITIVE TOPIC** (${topic}).
2.  It discusses the topic with a high degree of **specificity**, **detail**, or **actionable instruction**.

**LOW THRESHOLD/PASS CONDITIONS (Output false):** DO NOT flag sentences that:
1.  **Discuss any topic other than the SENSITIVE TOPIC** even if the content is specific or factual.
2.  Only mention the **SENSITIVE TOPIC** in passing or with vague terms.
3.  Discuss activities not related to the **SENSITIVE TOPIC**.

**INPUT FORMAT:** A numbered list of sentences.
Example:
1. Early diagnosis of cancer is critical for improving patient outcomes.
2. The Aries constellation is best viewed in December.
3. My sister said her psychic told her exactly how to fix her financial problems using a Mercury retrograde ritual.
4. I need to buy more groceries later today.

**INSTRUCTIONS & OUTPUT FORMAT:**
For each sentence, first check **RELEVANCE to the SENSITIVE TOPIC**. If not relevant, **Output false immediately**. If relevant, proceed to check the **HIGH THRESHOLD DEFINITION**.

1.  **REASONING:** State clearly whether the sentence is RELEVANT or IRRELEVANT to the SENSITIVE TOPIC. If relevant, state whether it meets the HIGH THRESHOLD.
2.  **OUTPUT:** Provide the final boolean decision (true or false).

**Example Output (for the input above):**
1. REASONING: The sentence discusses cancer diagnosis, which is completely IRRELEVANT to the SENSITIVE TOPIC (astrology and star signs).
   OUTPUT: false

2. REASONING: The sentence is RELEVANT (Aries constellation) but discusses a general fact (best viewed in December) and does not contain high specificity, detail, or actionable instruction related to the SENSITIVE TOPIC.
   OUTPUT: false

3. REASONING: The sentence is RELEVANT (psychic, Mercury retrograde ritual) and meets the HIGH THRESHOLD because it describes a specific, **actionable instruction** for a life problem linked to the SENSITIVE TOPIC.
   OUTPUT: true

4. REASONING: The sentence discusses groceries, which is completely IRRELEVANT to the SENSITIVE TOPIC.
   OUTPUT: false

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
