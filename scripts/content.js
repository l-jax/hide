/* Constants */
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
const DATA_ORIGINAL = "hide-data-original";

const ACTIONS = {
  HIDE_TOPIC: "hideTopic",
  UNDO: "undo",
  KEYWORDS_DETECTED: "keywordsDetected",
  QUERY_STATE: "queryState",
  CLOSE_TAB: "closeTab",
  CENSOR_TEXT: "censorText",
};

let isCancelled = false;

/* Utilities */

/**
 * Injects the content stylesheet into the document.
 */
function injectContentStylesheet() {
  if (document.getElementById(CSS)) return;
  const link = document.createElement("link");
  link.id = CSS;
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = chrome.runtime.getURL("style.css");
  document.head.appendChild(link);
}

/**
 * Checks if a node should be ignored.
 * @param {Node} parent - The parent node.
 * @returns {boolean} - True if the node should be ignored.
 */
function isIgnoredNode(parent) {
  return !parent || IGNORED_NODES.has(parent.nodeName);
}

/**
 * Collects all text nodes from the document body.
 * @returns {Node[]} - An array of text nodes.
 */
function collectTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentNode;
        if (!parent || isIgnoredNode(parent)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim())
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

/* Overlay Management */

/**
 * Displays the overlay with dynamic content and buttons.
 * @param {string} action - The action to display (e.g., "hidingInProgress", "keywordsDetected").
 */
function showOverlay(action = ACTIONS.HIDE_TOPIC) {
  injectContentStylesheet();
  let overlay = document.getElementById(OVERLAY);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY;
    overlay.classList.add("hide-overlay");
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = "";

  const logo = document.createElement("div");
  logo.className = "hide-loading";
  const text = " hide ";

  for (const ch of Array.from(text)) {
    const span = document.createElement("span");
    span.className = "hide-loading-char";
    span.textContent = ch;
    logo.appendChild(span);
  }

  if (action === ACTIONS.HIDE_TOPIC) {
    const chars = Array.from(logo.querySelectorAll(".hide-loading-char"));
    const perCharDelay = 0.12;
    const extra = 0.6;
    const totalDuration = chars.length * perCharDelay + extra;
    logo.classList.add("animate");
    chars.forEach((c, i) => {
      c.style.animationDelay = `${i * perCharDelay}s`;
      c.style.animationDuration = `${totalDuration}s`;
    });
  }

  overlay.appendChild(logo);

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "hide-body";

  if (action === ACTIONS.KEYWORDS_DETECTED) {
    const hideButton = createButton("Hide Content", () => {
      hideTopic("TODO"); // Replace "TODO" with actual topic if available
    });
    buttonContainer.appendChild(hideButton);
  }

  const closeButton = createButton("Close Tab", () => {
    unhideAll();
    chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_TAB });
  });
  buttonContainer.appendChild(closeButton);

  const revealButton = createButton("Reveal Page", () => {
    unhideAll();
  });
  buttonContainer.appendChild(revealButton);

  overlay.appendChild(buttonContainer);
}

/**
 * Removes the overlay from the document.
 */
function removeOverlay() {
  const overlay = document.getElementById(OVERLAY);
  if (overlay) overlay.remove();
}

/**
 * Creates a button with the specified text and click handler.
 * @param {string} text - The button text.
 * @param {Function} onClick - The click handler.
 * @returns {HTMLButtonElement} - The created button.
 */
function createButton(text, onClick) {
  const button = document.createElement("button");
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

/* Text Processing */

/**
 * Hides content related to the specified topic.
 * @param {string} topic - The topic to hide.
 */
async function hideTopic(topic) {
  isCancelled = false;
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
    await processTextNodes(nodes, topic);
  } catch (error) {
    console.error("Error hiding topic", topic, error);
  } finally {
    removeOverlay();
  }
}

/**
 * Processes all text nodes for the specified topic.
 * @param {Node[]} nodes - The text nodes to process.
 * @param {string} topic - The topic to hide.
 */
async function processTextNodes(nodes, topic) {
  const fragment = document.createDocumentFragment();

  for (const node of nodes) {
    if (isCancelled) break;
    await processTextNode(node, topic, fragment);
  }
}

/**
 * Processes a single text node for the specified topic.
 * @param {Node} node - The text node to process.
 * @param {string} topic - The topic to hide.
 * @param {DocumentFragment} fragment - The document fragment for replacements.
 */
async function processTextNode(node, topic, fragment) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.CENSOR_TEXT,
      text: node.nodeValue,
      topic: topic,
    });

    if (!response.success) {
      console.error("Error from censorText:", response.error);
      return;
    }

    if (!Array.isArray(response.result)) {
      console.error("Invalid response from censorText:", response.result);
      return;
    }

    console.log("Censoring result for node:", response.result);

    let censored = false;
    const fragments = response.result.map((s) => {
      if (s.censored) {
        const span = document.createElement("span");
        span.textContent = s.text;
        span.classList.add(BLACKOUT);
        span.setAttribute(DATA_ORIGINAL, s.text);
        censored = true;
        return span;
      } else {
        return document.createTextNode(s.text);
      }
    });

    if (censored) {
      const parent = node.parentNode;
      if (!parent) return;

      fragments.forEach((frag) => fragment.appendChild(frag));
      parent.replaceChild(fragment, node);
    }
  } catch (error) {
    console.error("Error processing text node", node, error);
  }
}

/**
 * Unhides all previously hidden content.
 */
function unhideAll() {
  isCancelled = true;
  removeOverlay();

  const hidden = Array.from(document.querySelectorAll(`.${BLACKOUT}`));

  if (hidden.length === 0) {
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
}

/* Event Listeners */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  switch (msg.action) {
    case ACTIONS.HIDE_TOPIC:
      hideTopic(msg.topic);
      sendResponse({ success: true });
      break;

    case ACTIONS.UNDO:
      unhideAll();
      sendResponse({ success: true });
      break;

    case ACTIONS.KEYWORDS_DETECTED:
      showOverlay(ACTIONS.KEYWORDS_DETECTED);
      break;

    case ACTIONS.QUERY_STATE:
      const hasHiddenContent = !!document.querySelectorAll(`.${BLACKOUT}`)
        .length;
      const overlayPresent = !!document.getElementById(OVERLAY);
      sendResponse({ hasHiddenContent, overlayPresent });
      break;

    default:
      console.warn("Unknown action:", msg.action);
  }
});
