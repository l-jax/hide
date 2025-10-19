const IGNORED_NODES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
]);
const CSS = "hide-content-css";
const OVERLAY = "hide-overlay";
const BLACKOUT = "hide-extension-blackout";
const LOADING = "hide-loading";
const LOADING_CHAR = "hide-loading-char";
const DATA_ORIGINAL = "hide-data-original";

let session;

function isIgnoredNode(parent) {
  return !parent || IGNORED_NODES.has(parent.nodeName);
}

function collectTextNodes(root = document.body) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentNode;
      if (!parent || isIgnoredNode(parent)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim())
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let nd;
  while ((nd = walker.nextNode())) nodes.push(nd);
  return nodes;
}

function injectContentStylesheet() {
  if (document.getElementById(CSS)) return;
  const link = document.createElement("link");
  link.id = CSS;
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = chrome.runtime.getURL("style.css");
  document.head.appendChild(link);
}

function showOverlay() {
  injectContentStylesheet();
  if (document.getElementById(OVERLAY)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY;
  overlay.classList.add(OVERLAY);

  const loading = document.createElement("div");
  loading.className = LOADING;

  const word = " hide ";
  for (const ch of Array.from(word)) {
    const span = document.createElement("span");
    span.className = LOADING_CHAR;
    span.textContent = ch;
    loading.appendChild(span);
  }

  overlay.appendChild(loading);
  document.body.appendChild(overlay);

  const chars = Array.from(overlay.querySelectorAll(`.${LOADING_CHAR}`));
  const perCharDelay = 0.12;
  const extra = 0.6;
  const totalDuration = chars.length * perCharDelay + extra;
  loading.classList.add("animate");
  chars.forEach((c, i) => {
    c.style.animationDelay = `${i * perCharDelay}s`;
    c.style.animationDuration = `${totalDuration}s`;
  });
}

function removeOverlay() {
  const overlay = document.getElementById(OVERLAY);
  if (overlay) overlay.remove();
}

async function runPrompt(topic, sentences) {
  const prompt = `
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

  const schema = {
    type: "array",
    items: { type: "integer" },
    description: "Indices of sentences that discuss the topic.",
  };

  if (!("LanguageModel" in self)) {
    console.error("LanguageModel not available");
    return [];
  }
  try {
    if (!session) {
      session = await LanguageModel.create();
    }
    const result = await session.prompt(prompt, {
      responseConstraint: schema,
    });
    return JSON.parse(result);
  } catch (e) {
    console.error("Error processing prompt", prompt, e);
    reset();
    return [];
  }
}

async function reset() {
  if (session) {
    session.destroy();
  }
  session = null;
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

async function hideTopic(topic) {
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    console.error("Invalid topic provided", topic);
    return;
  }
  console.log("Hiding topic:", topic);

  const nodes = collectTextNodes();
  if (nodes.length === 0) {
    console.warn("No text nodes found to process");
    return;
  }

  showOverlay();

  try {
    const fragment = document.createDocumentFragment();

    for (const node of nodes) {
      try {
        const originalText = node.nodeValue;
        const sentences = splitIntoSentences(originalText);
        if (sentences.length === 0) continue;

        const results = await runPrompt(topic, sentences);
        const censoredIndices = new Set(results);

        let censored = false;
        const fragments = [];
        sentences.forEach((s, i) => {
          if (censoredIndices.has(i)) {
            const span = document.createElement("span");
            span.textContent = s.text;
            span.classList.add(BLACKOUT);
            span.setAttribute(DATA_ORIGINAL, s.text);
            fragments.push(span);
            censored = true;
          } else {
            fragments.push(document.createTextNode(s.text));
          }
        });

        if (censored) {
          const parent = node.parentNode;
          if (!parent) continue;

          fragments.forEach((frag) => fragment.appendChild(frag));
          parent.replaceChild(fragment, node);
        }
      } catch (nodeError) {
        console.error("Error processing node", node, nodeError);
      }
    }
  } catch (e) {
    console.error("Error hiding topic", topic, e);
  } finally {
    removeOverlay();
    reset();
  }
}

function unhideAll() {
  removeOverlay();

  const hidden = Array.from(document.querySelectorAll(`.${BLACKOUT}`));

  if (hidden.length === 0) {
    console.warn("No hidden content to restore");
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const element of hidden) {
    try {
      const parent = element.parentNode;
      if (!parent) continue;

      const originalText = element.getAttribute(DATA_ORIGINAL);
      if (originalText !== null) {
        const textNode = document.createTextNode(originalText);
        fragment.appendChild(textNode);
        parent.replaceChild(fragment, element);
      }
    } catch (restoreError) {
      console.error("Error restoring element", element, restoreError);
    }
  }

  try {
    if (document.body && typeof document.body.normalize === "function") {
      document.body.normalize();
    }
  } catch (e) {
    console.warn("Error normalizing document body", e);
  }

  reset();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  if (msg.action === "hideTopic" && typeof msg.topic === "string") {
    hideTopic(msg.topic);
    return;
  }

  if (msg.action === "undo") {
    unhideAll();
    return;
  }

  if (msg.action === "queryState") {
    const hasHiddenContent = !!document.querySelectorAll(`.${BLACKOUT}`).length;
    const overlayPresent = !!document.getElementById(OVERLAY);
    sendResponse({ hasHiddenContent, overlayPresent });
    return;
  }
});
