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

async function hideSentencesContainingKeywords(keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) return;

    console.log('Hiding sentences containing keywords', keywords);

    const escaped = keywords.map(k => escapeForRegex(k)).filter(k => k.length > 0);
    if (escaped.length === 0) return;
    const keywordRegex = new RegExp(`(${escaped.join('|')})`, 'i');

    const textNodes = collectTextNodes();
    if (textNodes.length === 0) return;

    console.log(`Collected ${textNodes.length} text nodes`);

    const nodeTexts = textNodes.map(n => n.nodeValue);
    const pageText = nodeTexts.join('\n');
    if (!pageText || pageText.trim().length === 0) return;

    const chunks = [];
    if (pageText.length <= MAX_MODEL_CHARS) {
        chunks.push({ text: pageText, startIndex: 0 });
    } else {
        let cursor = 0;
        while (cursor < pageText.length) {
            const end = Math.min(cursor + MAX_MODEL_CHARS, pageText.length);
            let sliceEnd = end;
            const lookahead = Math.min(pageText.length, end + 200);
            const sub = pageText.slice(end, lookahead);
            const match = sub.match(/[.!?]\s/);
            if (match) sliceEnd = end + match.index + 1;
            chunks.push({ text: pageText.slice(cursor, sliceEnd), startIndex: cursor });
            cursor = sliceEnd;
        }
    }

    console.log(`Chunked page text into ${chunks.length} pieces for summarization`);

    const summarizer = await createSummarizer();
    if (!summarizer) return;
    let combinedSummary = '';
    for (const chunk of chunks) {
        try {
            const s = await generateSummary(summarizer, chunk.text);
            console.log(`Generated summary for chunk starting at index ${chunk.startIndex}`);

            if (s) combinedSummary += (combinedSummary ? '\n' : '') + s;
        } catch (e) {
            console.error('Page summarization chunk failed', e);
        }
    }

    summarizer.destroy();

    if (!combinedSummary || !keywordRegex.test(combinedSummary)) return;

    console.log('Summary indicates keywords are present on page, proceeding to hide matching sentences');

    const nodeShouldHide = [];
    for (let ni = 0; ni < textNodes.length; ni++) {
        const parts = textNodes[ni].nodeValue.match(SENTENCE_DELIMITER) || [textNodes[ni].nodeValue];
        for (let li = 0; li < parts.length; li++) {
            if (keywordRegex.test(parts[li])) {
                if (!nodeShouldHide[ni]) nodeShouldHide[ni] = [];
                nodeShouldHide[ni][li] = true;
            }
        }
    }

    for (let ni = 0; ni < textNodes.length; ni++) {
        if (!nodeShouldHide[ni]) continue;
        const parts = (textNodes[ni].nodeValue.match(SENTENCE_DELIMITER) || [textNodes[ni].nodeValue]);
        const hideFlags = nodeShouldHide[ni];
        replaceTextNodeWithParts(textNodes[ni], parts, (part, idx) => !!hideFlags[idx]);
    }
}

async function createSummarizer() {
    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
        console.log('Summarizer API is not available');
        return null;
    }

    const options = {
      sharedContext: 'this is a website',
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
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
                span.style.background = '#151715';
                span.style.color = '#151715';
                span.style.borderRadius = '2px';
                span.style.padding = '0 2px';
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
