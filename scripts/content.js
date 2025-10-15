const SENTENCE_DELIMITER = /[^.!?\n]+[.!?]?/g;
const IGNORED_NODES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
]);

const MAX_MODEL_CHARS = 1000;
const SCHEMA = {
  type: "object",
  properties: {
    doesContainTopic: { type: "boolean" },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["doesContainTopic"],
  additionalProperties: false,
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

function showOverlay(message = "Processing...") {
  injectContentStylesheet();
  if (document.getElementById("hide-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "hide-overlay";
  overlay.classList.add("hide-overlay");
  const text = document.createElement("div");
  text.textContent = message;
  overlay.appendChild(text);
  document.body.appendChild(overlay);
}

function removeOverlay() {
  const overlay = document.getElementById("hide-overlay");
  if (overlay) overlay.remove();
}

function replaceTextNodeWithParts(textNode, parts, shouldHide) {
  if (!textNode || !parts || parts.length === 0) return;
  const parent = textNode.parentNode;
  if (!parent) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    try {
      if (shouldHide && shouldHide(part, i)) {
        const span = document.createElement("span");
        span.textContent = part;
        span.classList.add("hide-extension-blackout");
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    } catch (e) {
      frag.appendChild(document.createTextNode(part));
    }
  }
  parent.replaceChild(frag, textNode);
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

function breakIntoChunks(nodes) {
  const texts = nodes.map((n) => n.nodeValue);
  const pageText = texts.join("\n");
  if (!pageText || pageText.trim().length === 0) return;

  const chunks = [];
  if (pageText.length <= MAX_MODEL_CHARS) {
    chunks.push({ text: pageText, startIndex: 0 });
  } else {
    let position = 0;
    while (position < pageText.length) {
      const end = Math.min(position + MAX_MODEL_CHARS, pageText.length);
      let sliceEnd = end;
      const lookahead = Math.min(pageText.length, end + 200);
      const sub = pageText.slice(end, lookahead);
      const match = sub.match(/[.!?]\s/);
      if (match) sliceEnd = end + match.index + 1;
      chunks.push({
        text: pageText.slice(position, sliceEnd),
        startIndex: position,
      });
      position = sliceEnd;
    }
  }
  return chunks;
}

async function hideTopic(topic) {
  if (!topic || typeof topic !== "string" || !topic.trim()) return;
  console.log("Hiding topic:", topic);

  const nodes = collectTextNodes();
  if (nodes.length === 0) return;
  console.log(`Collected ${nodes.length} text nodes`);

  const chunks = breakIntoChunks(nodes);
  if (!chunks || chunks.length === 0) return;
  console.log(`Broken into ${chunks.length} chunks`);

  showOverlay("Hiding content discussing your topic...");
  try {
    for (const chunk of chunks) {
      console.log(`Processing chunk: ${chunk.text}`);
      const result = await runPrompt(
        `Does the text discuss the topic: "${topic}"? If so return true and provide a list of keywords that would allow us to censor the topic in the text.\n\nText:\n${chunk.text}\n`
      );
      console.log("Prompt result:", result);

      if (
        result &&
        typeof result === "object" &&
        result.doesContainTopic === true &&
        Array.isArray(result.keywords) &&
        result.keywords.length > 0
      ) {
        const keywords = result.keywords.map((k) => k.toLowerCase());
        for (const node of nodes) {
          if (!node || !node.nodeValue) continue;
          const sentences = node.nodeValue.match(SENTENCE_DELIMITER) || [
            node.nodeValue,
          ];
          replaceTextNodeWithParts(node, sentences, (part) => {
            const lower = part.toLowerCase();
            return keywords.some((kw) => kw.length > 0 && lower.includes(kw));
          });
        }
      }
    }
  } finally {
    removeOverlay();
    reset();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Content script received message:", msg);
  if (!msg || !msg.action) return;
  if (msg.action === "hideTopic" && typeof msg.topic === "string") {
    hideTopic(msg.topic);
  }
});
