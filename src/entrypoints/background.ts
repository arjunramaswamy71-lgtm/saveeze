// Clears the toolbar badge when you leave the page it was about.
export default defineBackground(() => {
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading' || info.url) {
      void browser.action.setBadgeText({ tabId, text: '' });
    }
  });
});
