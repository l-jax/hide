const IGNORED_NODES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
]);

const PROMPT = `
Does the following sentence discuss the topic "{topic}" in any context? 
Sentence: "{sentence}"
Return true if yes, false if not.
`;

const SCHEMA = {
  type: "boolean",
  description: "Does the sentence contain the specified topic?",
};

let session;

function isIgnoredNode(parent) {
  return !parent || IGNORED_NODES.has(parent.nodeName);
}

function collectTextNodes(root = document.body) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentNode;
      if (!p || isIgnoredNode(p)) return NodeFilter.FILTER_REJECT;
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let nd;
  while ((nd = walker.nextNode())) nodes.push(nd);
  return nodes;
}

function injectContentStylesheet() {
  if (document.getElementById("hide-content-css")) return;
  const link = document.createElement("link");
  link.id = "hide-content-css";
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = chrome.runtime.getURL("style.css");
  document.head.appendChild(link);
}

function showOverlay() {
  injectContentStylesheet();
  if (document.getElementById("hide-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "hide-overlay";
  overlay.classList.add("hide-overlay");

  const loading = document.createElement("div");
  loading.className = "hide-loading";

  const word = " hide ";
  for (const ch of Array.from(word)) {
    const span = document.createElement("span");
    span.className = "hide-loading-char";
    span.textContent = ch;
    loading.appendChild(span);
  }

  overlay.appendChild(loading);
  document.body.appendChild(overlay);
  const chars = Array.from(overlay.querySelectorAll(".hide-loading-char"));
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
  const overlay = document.getElementById("hide-overlay");
  if (overlay) overlay.remove();
}

async function runPrompt(prompt) {
  if (!("LanguageModel" in self)) {
    console.log("LanguageModel not available");
    return false;
  }

  try {
    if (!session) {
      session = await LanguageModel.create();
    }
    const result = await session.prompt(prompt, {
      responseConstraint: SCHEMA,
    });

    try {
      const parsed = JSON.parse(result);
      return parsed;
    } catch (e) {
      console.log("Unrecognized prompt response:", result);
      return false;
    }
  } catch (e) {
    console.log("Prompt failed");
    console.error(e);
    console.log("Prompt:", prompt);
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
  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), s => s.segment);
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
      if (!node || !node.nodeValue) continue;
      const sentences = splitIntoSentences(node.nodeValue);
      let censored = false;
      const fragments = [];

      for (const sentence of sentences) {
        console.log("Analyzing sentence:", sentence);
        const result = await runPrompt(
          PROMPT.replace("{topic}", topic).replace("{sentence}", sentence)
        );

        if (!result) continue;

        if (typeof result === "boolean" && result === true) {
          console.log("Censoring sentence:", sentence);
          const span = document.createElement("span");
          span.textContent = sentence;
          span.classList.add("hide-extension-blackout");
          fragments.push(span);
          censored = true;
        } else {
          fragments.push(document.createTextNode(sentence));
        }
      }

      if (censored) {
        const parent = node.parentNode;
        if (!parent) continue;
        fragments.forEach(frag => parent.insertBefore(frag, node));
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

  const hidden = Array.from(
    document.querySelectorAll(".hide-extension-blackout")
  );

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
    const hasHiddenContent = !!document.querySelectorAll(
      ".hide-extension-blackout"
    ).length;
    const overlayPresent = !!document.getElementById("hide-overlay");
    sendResponse({ hasHiddenContent, overlayPresent });
    return;
  }
});
