const IGNORED_NODES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
]);

const ACTIONS = {
  CENSOR_TEXT: "censorText",
  CLOSE_TAB: "closeTab",
  HIDE_TOPIC: "hideTopic",
  KEYWORDS_DETECTED: "keywordsDetected",
  QUERY_STATE: "queryState",
  UNDO: "undo",
};

let isCancelled = false;

const OVERLAY_CONFIG = {
  [ACTIONS.HIDE_TOPIC]: {
    message: "hiding in progress",
    animateLogo: true,
    buttons: [
      {
        text: "Close",
        onClick: () => {
          unhideAll();
          chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_TAB });
        },
      },
      {
        text: "Reveal",
        onClick: () => {
          unhideAll();
        },
      },
    ],
  },
  [ACTIONS.KEYWORDS_DETECTED]: {
    message: (keyword) => `this page contains keyword: "${keyword}"`,
    animateLogo: false,
    buttons: [
      {
        text: "Close",
        onClick: () => {
          unhideAll();
          chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_TAB });
        },
      },
      {
        text: "Reveal",
        onClick: () => {
          unhideAll();
        },
      },
      {
        text: "Hide",
        onClick: async () => {
          const topic = await chrome.storage.local.get("topic");
          hideTopic(topic.topic);
        },
      },
    ],
  },
};

/* Utilities */

/**
 * Injects the content stylesheet into the document.
 */
function injectContentStylesheet() {
  if (document.getElementById("hide-content-css")) return;
  const link = document.createElement("link");
  link.id = "hide-content-css";
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
  const overlay = document.getElementById("hide-overlay");

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentNode;

        // Exclude ignored nodes and nodes inside the overlay
        if (
          !parent ||
          isIgnoredNode(parent) ||
          (overlay && overlay.contains(node))
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  return nodes;
}

function getMinimalPageContent() {
  let contentParts = [];

  const title = document.title;
  if (title) {
    contentParts.push(title);
  }

  const metaDescriptionTag = document.querySelector(
    'meta[name="description"], meta[property="og:description"]'
  );
  const metaDescription = metaDescriptionTag ? metaDescriptionTag.content : "";
  if (metaDescription) {
    contentParts.push(metaDescription);
  }

  const h1Element = document.querySelector("h1");
  const h1Text = h1Element ? h1Element.innerText.trim() : "";
  if (h1Text) {
    contentParts.push(h1Text);
  }

  const mainContentContainer = document.querySelector(
    "main, article, #content, body"
  );
  const firstParagraph = mainContentContainer
    ? mainContentContainer.querySelector("p")
    : document.querySelector("p");
  const pText = firstParagraph ? firstParagraph.innerText.trim() : "";
  if (pText && pText.length > 30) {
    contentParts.push(pText);
  }

  const minimalText = contentParts.join(". ");

  return minimalText;
}

/* Overlay Management */

/**
 * Creates the overlay container if it doesn't exist.
 * @returns {HTMLElement} - The overlay element.
 */
function getOrCreateOverlay() {
  let overlay = document.getElementById("hide-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "hide-overlay";
    overlay.classList.add("hide-overlay");
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = ""; // Clear existing content
  return overlay;
}

/**
 * Creates the loading animation for the overlay.
 * @param {boolean} animate - Whether to animate the logo.
 * @returns {HTMLElement} - The loading animation element.
 */
function createLoadingAnimation(animate) {
  const logo = document.createElement("div");
  logo.className = "hide-loading";
  const text = " hide ";

  for (const ch of Array.from(text)) {
    const span = document.createElement("span");
    span.className = "hide-loading-char";
    span.textContent = ch;
    span.textDecoration = "line-through";
    logo.appendChild(span);
  }

  if (animate) {
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

  return logo;
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

/**
 * Populates the overlay with content based on the action.
 * @param {HTMLElement} overlay - The overlay element.
 * @param {string} action - The action to display.
 * @param {string} [keyword] - The detected keyword (if any).
 */
function populateOverlay(overlay, action, keyword) {
  const config = OVERLAY_CONFIG[action];
  if (!config) {
    console.warn("No configuration found for action:", action);
    return;
  }

  const logo = createLoadingAnimation(config.animateLogo);
  overlay.appendChild(logo);

  if (config.message) {
    const info = document.createElement("div");
    info.className = "hide-info";
    info.textContent =
      typeof config.message === "function"
        ? config.message(keyword)
        : config.message;
    overlay.appendChild(info);
  }

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "hide-body";

  config.buttons.forEach(({ text, onClick }) => {
    const button = createButton(text, onClick);
    buttonContainer.appendChild(button);
  });

  overlay.appendChild(buttonContainer);
}

/**
 * Displays the overlay with dynamic content and buttons.
 * @param {string} action - The action to display
 * @param {string} [keyword] - The detected keyword (if any).
 */
function showOverlay(action = ACTIONS.HIDE_TOPIC, keyword) {
  injectContentStylesheet();
  const overlay = getOrCreateOverlay();
  populateOverlay(overlay, action, keyword);
}

/**
 * Removes the overlay from the document.
 */
function removeOverlay() {
  const overlay = document.getElementById("hide-overlay");
  if (overlay) overlay.remove();
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

    if (isCancelled) return;

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
        span.classList.add("hide-extension-blackout");
        span.setAttribute("hide-data-original", s.text);
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
  const overlay = document.getElementById("hide-overlay");
  if (overlay) overlay.remove();

  const hidden = Array.from(
    document.querySelectorAll(".hide-extension-blackout")
  );

  if (hidden.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const element of hidden) {
    try {
      const parent = element.parentNode;
      if (!parent) continue;

      const originalText = element.getAttribute("hide-data-original");
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

window.addEventListener("load", () => {
  const minimalContent = getMinimalPageContent();
  chrome.storage.local.get("keywords").then((result) => {
    const keywords = result.keywords || [];
    console.log(
      "Checking minimal page content for keywords:",
      minimalContent,
      keywords
    );
    const minimalContentMatches = keywords.some((keyword) => {
      return minimalContent.toLowerCase().includes(keyword.toLowerCase());
    });
    if (minimalContentMatches) {
      showOverlay(
        ACTIONS.KEYWORDS_DETECTED,
        keywords.find((keyword) =>
          minimalContent.toLowerCase().includes(keyword.toLowerCase())
        )
      );
    }
  });
});

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
