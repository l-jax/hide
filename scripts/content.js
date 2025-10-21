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
const LOADING = "hide-loading";
const LOADING_CHAR = "hide-loading-char";
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
 * Displays the overlay
 * @param {string} action - Description of the action to display (e.g., "hidingInProgress").
 */
function showOverlay(action = ACTIONS.HIDE_TOPIC) {
  injectContentStylesheet();
  let overlay = document.getElementById(OVERLAY);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY;
    overlay.classList.add(OVERLAY);
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = "";

  if (action === ACTIONS.HIDE_TOPIC) {
    createLoadingAnimation(overlay);
  } else if (action === ACTIONS.KEYWORDS_DETECTED) {
    createKeywordsOverlay(overlay);
  }
}

/**
 * Removes the overlay from the document.
 */
function removeOverlay() {
  const overlay = document.getElementById(OVERLAY);
  if (overlay) overlay.remove();
}

/**
 * Creates the loading animation for the overlay.
 * @param {HTMLElement} overlay - The overlay element.
 */
function createLoadingAnimation(overlay) {
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

/**
 * Creates the keywords detected overlay with options.
 * @param {HTMLElement} overlay - The overlay element.
 */
function createKeywordsOverlay(overlay) {
  const loadingText = document.createElement("div");
  loadingText.className = LOADING;
  loadingText.textContent = " hide ";
  overlay.appendChild(loadingText);

  const explanation = document.createElement("p");
  explanation.textContent = "Keywords detected. What would you like to do?";
  explanation.style.marginTop = "20px";
  explanation.style.textAlign = "center";
  overlay.appendChild(explanation);

  const options = document.createElement("div");
  options.style.display = "flex";
  options.style.justifyContent = "center";
  options.style.gap = "10px";
  options.style.marginTop = "20px";

  const hideButton = createButton("Hide Content", () => {
    chrome.runtime.sendMessage({
      action: ACTIONS.HIDE_TOPIC,
      topic: "detected",
    });
    removeOverlay();
  });
  const closeButton = createButton("Close Tab", () => {
    chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_TAB });
  });
  const removeButton = createButton("Remove Overlay", removeOverlay);

  options.append(hideButton, closeButton, removeButton);
  overlay.appendChild(options);
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
      showOverlay(KEYWORDS_DETECTED);
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
