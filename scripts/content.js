const MAX_MODEL_CHARS = 4000;

function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function hideSentencesContainingKeywords(keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) return;
    const escaped = keywords.map(k => escapeForRegex(k)).filter(k => k.length > 0);
    if (escaped.length === 0) return;
    const keywordRegex = new RegExp(`(${escaped.join('|')})`, 'i');

    const sentenceRe = /[^.!?\n]+[.!?]?/g;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const toReplace = [];
    let node;
    
    while (node = walker.nextNode()) {
        const p = node.parentNode;
        if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(p.nodeName)) continue;
        const text = node.nodeValue;
        if (!text || !keywordRegex.test(text)) continue;
        toReplace.push(node);
    }

    toReplace.forEach(async textNode => {
        let summary;
        if (textNode.nodeValue.length > MAX_MODEL_CHARS) {
            // TODO: handle long text nodes by splitting into parts
            throw new Error('Text node too long for summarization');
        }
        summary = await generateSummary(textNode);

        console.log('Summary:', summary);

        if (summary && summary.length > 0 && !keywordRegex.test(summary)) return;

        const text = textNode.nodeValue;
        const parts = text.match(sentenceRe) || [text];
        if (parts.length === 1 && !keywordRegex.test(parts[0])) return;

        replaceTextNodeWithParts(textNode, parts, (part) => keywordRegex.test(part));
    });
}

async function generateSummary(textNode) {
    const options = {
      sharedContext: 'this is a website',
      type: textNode.type,
      format: textNode.format,
      length: textNode.length < 500 ? 'short' : textNode.length < 2000 ? 'medium' : 'long',
    };
    
    try {
        const availability = await Summarizer.availability();
        let summarizer;
        if (availability === 'unavailable') {
            console.log('Summarizer API is not available');
            return null;
        }

        if (availability === 'available') {
            summarizer = await Summarizer.create(options);
        } else {
            summarizer = await Summarizer.create(options);
            summarizer.addEventListener('downloadprogress', (e) => {
                console.log(`Downloaded ${e.loaded * 100}%`);
            });
            await summarizer.ready;
        }
    
        const summary = await summarizer.summarize(textNode.nodeValue);
        summarizer.destroy();
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
            if (shouldHide && shouldHide(part)) {
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
            // fall back to text append
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
