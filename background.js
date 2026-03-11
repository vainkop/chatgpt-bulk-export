// When the extension icon is clicked, open export.html in a new tab
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('export.html') });
});
