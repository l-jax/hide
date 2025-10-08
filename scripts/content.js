function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blackoutTextNodes(keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) return;
    const escaped = keywords.map(k => escapeForRegex(k)).filter(k => k.length > 0);
    if (escaped.length === 0) return;
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const toReplace = [];
    let node;
    while (node = walker.nextNode()) {
        const p = node.parentNode;
        if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(p.nodeName)) continue;
        if (regex.test(node.nodeValue)) toReplace.push(node);
    }

    toReplace.forEach(textNode => {
        const parent = textNode.parentNode;
        const parts = textNode.nodeValue.split(regex);
        if (parts.length === 1) return;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                frag.appendChild(document.createTextNode(parts[i]));
            } else {
                const span = document.createElement('span');
                span.textContent = parts[i];
                span.style.background = 'black';
                span.style.color = 'black';
                span.style.borderRadius = '2px';
                span.style.padding = '0 2px';
                span.classList.add('hide-extension-blackout');
                frag.appendChild(span);
            }
        }
        parent.replaceChild(frag, textNode);
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return;
    if (msg.action === 'hideKeywords' && Array.isArray(msg.keywords)) {
        blackoutTextNodes(msg.keywords);
    }
});
