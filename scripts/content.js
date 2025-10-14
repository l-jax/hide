const MAX_MODEL_CHARS = 4000;

const SENTENCE_DELIMITER = /[^.!?\n]+[.!?]?/g;
const SPECIAL_CHAR = /[.*+?^${}()|[\]\\]/g;
const IGNORED_NODES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

function escapeForRegex(s) {
    return s.replace(SPECIAL_CHAR, '\\$&');
}

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
        }
    });
    let nd;
    while (nd = walker.nextNode()) nodes.push(nd);
    return nodes;
}

function injectContentStylesheet() {
    if (document.getElementById('hide-content-css')) return;
    const link = document.createElement('link');
    link.id = 'hide-content-css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('style.css');
    document.head.appendChild(link);
}

function showOverlay(message = "Processing...") {
    injectContentStylesheet();
    if (document.getElementById('hide-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'hide-overlay';
    overlay.classList.add('hide-overlay');
    const text = document.createElement('div');
    text.textContent = message;
    overlay.appendChild(text);
    document.body.appendChild(overlay);
}

function removeOverlay() {
    const overlay = document.getElementById('hide-overlay');
    if (overlay) overlay.remove();
}

async function hideSentencesContainingKeywords(keywords) {
    showOverlay("Hiding spoilers and sensitive content...");
    try {
        if (!Array.isArray(keywords) || keywords.length === 0) return;

        const escaped = keywords.map(k => escapeForRegex(k)).filter(k => k.length > 0);
        if (escaped.length === 0) return;
        const keywordRegex = new RegExp(`(${escaped.join('|')})`, 'i');

        const nodes = collectTextNodes();
        if (nodes.length === 0) return;

        const texts = nodes.map(n => n.nodeValue);
        const pageText = texts.join('\n');
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
                chunks.push({ text: pageText.slice(position, sliceEnd), startIndex: position });
                position = sliceEnd;
            }
        }

        const summarizer = await createSummarizer(escaped);
        if (!summarizer) return;

        let combinedSummary = '';
        for (const chunk of chunks) {
            try {
                const summary = await generateSummary(summarizer, chunk.text);
                if (summary) combinedSummary += (combinedSummary ? '\n' : '') + summary;
            } catch (e) {
                console.error('Page summarization chunk failed', e);
            }
        }

        summarizer.destroy();

        if (!combinedSummary || !keywordRegex.test(combinedSummary)) return;

        for (let i = 0; i < nodes.length; i++) {
            const parts = nodes[i].nodeValue.match(SENTENCE_DELIMITER) || [nodes[i].nodeValue];
            replaceTextNodeWithParts(
                nodes[i],
                parts,
                (part) => keywordRegex.test(part)
            );
        }
    } finally {
        removeOverlay();
        console.log('Finished hiding keywords');
    }
}

async function createSummarizer(keywords) {
    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
        console.log('Summarizer API is not available');
        return null;
    }

    const options = {
      sharedContext: `a summary to decide if the webpage talks about ${keywords.join(', ')}`,
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
      expectedInputLanguages: ["en"],
      outputLanguage: "en",
    };

    let summarizer;
    if (availability === 'available') {
        summarizer = await Summarizer.create(options);
    } else {
        summarizer = await Summarizer.create(options);
        summarizer.addEventListener('downloadprogress', (e) => {
            console.log(`Downloaded ${e.loaded * 100}%`);
        });
        await summarizer.ready;
    }
    return summarizer;
}

async function generateSummary(summarizer, text) {
    try {    
        const summary = await summarizer.summarize(text);
        console.log('Generated summary:', summary);
        return summary;
    } catch (e) {
        console.log('Summary generation failed');
        console.error(e);
        return null;
    }
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
                const span = document.createElement('span');
                span.textContent = part;
                span.classList.add('hide-extension-blackout');
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return;
    if (msg.action === 'hideKeywords' && Array.isArray(msg.keywords)) {
        hideSentencesContainingKeywords(msg.keywords);
    }
});
