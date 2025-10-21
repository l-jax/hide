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

let isCancelled = false;

/* Text processing */

function isIgnoredNode(parent) {
  return !parent || IGNORED_NODES.has(parent.nodeName);
}

function collectTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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

/* Overlay */

function injectContentStylesheet() {
  if (document.getElementById(CSS)) return;
  const link = document.createElement("link");
  link.id = CSS;
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = chrome.runtime.getURL("style.css");
  document.head.appendChild(link);
}

function showOverlay(action = "hidingInProgress", message = "") {
  injectContentStylesheet();
  let overlay = document.getElementById(OVERLAY);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY;
    overlay.classList.add(OVERLAY);
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = ""; // Clear existing content

  if (action === "hidingInProgress") {
    // Existing loading animation
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
  } else if (action === "keywordsDetected") {
    // Static loading text
    const loadingText = document.createElement("div");
    loadingText.className = LOADING;
    loadingText.textContent = " hide ";
    overlay.appendChild(loadingText);

    // Explanation message
    const explanation = document.createElement("p");
    explanation.textContent =
      message || "Keywords detected. What would you like to do?";
    explanation.style.marginTop = "20px";
    explanation.style.textAlign = "center";
    overlay.appendChild(explanation);

    // Options
    const options = document.createElement("div");
    options.style.display = "flex";
    options.style.justifyContent = "center";
    options.style.gap = "10px";
    options.style.marginTop = "20px";

    // "Hide Content" button
    const hideButton = document.createElement("button");
    hideButton.textContent = "Hide Content";
    hideButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "hideTopic", topic: "detected" });
      removeOverlay();
    });
    options.appendChild(hideButton);

    // "Close Tab" button
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close Tab";
    closeButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "closeTab" });
    });
    options.appendChild(closeButton);

    // "Remove Overlay" button
    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove Overlay";
    removeButton.addEventListener("click", () => {
      removeOverlay();
    });
    options.appendChild(removeButton);

    overlay.appendChild(options);
  }
}

function removeOverlay() {
  const overlay = document.getElementById(OVERLAY);
  if (overlay) overlay.remove();
}

async function processTextNode(node, topic, fragment) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "censorText",
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

    console.log("Censoring sentences:", response.result);

    let censored = false;
    const fragments = [];

    response.result.forEach((s) => {
      if (s.censored) {
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
      if (!parent) return;

      fragments.forEach((frag) => fragment.appendChild(frag));
      parent.replaceChild(fragment, node);
    }
  } catch (error) {
    console.error("Error processing text node", node, error);
  }
}

async function processTextNodes(nodes, topic) {
  const fragment = document.createDocumentFragment();

  for (const node of nodes) {
    if (isCancelled) break;
    await processTextNode(node, topic, fragment);
  }
}

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

/* Event listeners */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  if (msg.action === "hideTopic" && typeof msg.topic === "string") {
    hideTopic(msg.topic);
    chrome.runtime.sendMessage(msg, (response) => {
      sendResponse(response);
    });
    return true;
  }

  if (msg.action === "undo") {
    unhideAll();
    return;
  }

  if (msg.action === "keywordsDetected") {
    showOverlay(
      "keywordsDetected",
      "Keywords detected on this page. You can choose to hide the content, close the tab, or remove the overlay."
    );
    return;
  }

  if (msg.action === "queryState") {
    const hasHiddenContent = !!document.querySelectorAll(`.${BLACKOUT}`).length;
    const overlayPresent = !!document.getElementById(OVERLAY);
    sendResponse({ hasHiddenContent, overlayPresent });
    return;
  }
});
