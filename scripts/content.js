function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hideSentencesContainingKeywords(keywords) {
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

    toReplace.forEach(textNode => {
        const text = textNode.nodeValue;
        const parts = text.match(sentenceRe) || [text];
        if (parts.length === 1 && !keywordRegex.test(parts[0])) return;

        replaceTextNodeWithParts(textNode, parts, (part) => keywordRegex.test(part));
    });
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
