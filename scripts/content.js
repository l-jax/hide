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
  const promptTemplate = `
For each sentence below, does it discuss the topic "{topic}" in any context?
Return a JSON array of booleans, one for each sentence, in the same order.
Sentences:
{sentences}
`;
  const schema = {
    type: "array",
    items: { type: "boolean" },
    description:
      "Array of booleans indicating if each sentence contains the topic.",
  };

  if (!("LanguageModel" in self)) {
    console.log("LanguageModel not available");
    return [];
  }
  try {
    if (!session) {
      session = await LanguageModel.create();
    }
    const prompt = promptTemplate
      .replace("{topic}", topic)
      .replace("{sentences}", JSON.stringify(sentences));
    const result = await session.prompt(prompt, {
      responseConstraint: schema,
    });
    return JSON.parse(result);
  } catch (e) {
    console.log("Prompt failed", e);
    reset();
    throw e;
  }
}

async function reset() {
  if (session) {
    session.destroy();
  }
  session = null;
}

function splitIntoSentences(text) {
  if ("Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
}

async function hideTopic(topic) {
  if (!topic || typeof topic !== "string" || !topic.trim()) return;
  console.log("Hiding topic:", topic);

  const nodes = collectTextNodes();
  if (nodes.length === 0) return;
  console.log(`Collected ${nodes.length} text nodes`);

  showOverlay();

  try {
    for (const node of nodes) {
      const sentences = splitIntoSentences(node.nodeValue);
      if (sentences.length === 0) continue;

      const results = await runPrompt(topic, sentences);

      let censored = false;
      const fragments = [];
      for (let i = 0; i < sentences.length; i++) {
        if (results[i] === true) {
          const span = document.createElement("span");
          span.textContent = sentences[i];
          span.classList.add(BLACKOUT);
          fragments.push(span);
          censored = true;
        } else {
          fragments.push(document.createTextNode(sentences[i]));
        }
      }
      if (censored) {
        const parent = node.parentNode;
        if (!parent) continue;
        fragments.forEach((frag) => parent.insertBefore(frag, node));
        parent.removeChild(node);
      }
    }
  } finally {
    removeOverlay();
    reset();
  }
}

function unhideAll() {
  removeOverlay();

  const hidden = Array.from(document.querySelectorAll(`.${BLACKOUT}`));

  if (hidden.length === 0) return;

  for (const element of hidden) {
    const parent = element.parentNode;
    if (!parent) continue;
    const text = document.createTextNode(element.textContent || "");
    parent.replaceChild(text, element);
  }

  try {
    if (document.body && typeof document.body.normalize === "function") {
      document.body.normalize();
    }
  } catch (e) {
    console.warn("normalize failed", e);
  }

  reset();
  console.log("Restored hidden content");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Content script received message:", msg);
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
    const hasHiddenContent = !!document.querySelectorAll(`.${BLACKOUT}`)
      .length;
    const overlayPresent = !!document.getElementById(OVERLAY);
    sendResponse({ hasHiddenContent, overlayPresent });
    return;
  }
});
