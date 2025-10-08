document.getElementById('keywordForm').addEventListener('submit', function(e) {
	e.preventDefault();
	const keywords = document.getElementById('keywords').value
		.split(',')
		.map(k => k.trim())
		.filter(k => k.length > 0);
	if (keywords.length === 0) return;
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		chrome.tabs.sendMessage(tabs[0].id, {action: 'hideKeywords', keywords});
	});
});