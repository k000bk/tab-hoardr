// Toolbar badge + keeping content scripts alive in tabs that predate them.
browser.browserAction.setBadgeBackgroundColor({ color: '#16a34a' });
browser.browserAction.setBadgeTextColor?.({ color: '#ffffff' });

async function paint(tabId, url) {
  let text = '';
  if (hoardable(url)) {
    const k = KEY(normalize(url));
    if ((await browser.storage.local.get(k))[k]) text = '✓';
  }
  browser.browserAction.setBadgeText({ tabId, text }).catch(() => {});
}

browser.tabs.onUpdated.addListener((tabId, ch, tab) => {
  if (!ch.url && ch.status !== 'complete') return;
  paint(tabId, tab.url);
  // pushState/replaceState navigations fire onUpdated with a url but no reload,
  // so the content script has to re-check the store itself.
  if (ch.url) browser.tabs.sendMessage(tabId, 'sync').catch(() => {});
});

browser.tabs.onActivated.addListener(({ tabId }) =>
  browser.tabs.get(tabId).then(t => paint(tabId, t.url), () => {})
);

browser.storage.onChanged.addListener(async changes => {
  for (const t of await browser.tabs.query({})) {
    if (t.url && changes[KEY(normalize(t.url))]) paint(t.id, t.url);
  }
});

// Content scripts only inject into pages loaded *after* install. Tabs that were
// already open (every tab, after a temporary-addon reload) get no badge until
// reloaded — so inject into them by hand.
async function adopt() {
  for (const t of await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    browser.tabs.sendMessage(t.id, 'ping').catch(() =>
      browser.tabs
        .executeScript(t.id, { file: 'lib.js' })
        .then(() => browser.tabs.executeScript(t.id, { file: 'content.js' }))
        .catch(() => {}) // about:, view-source:, PDF viewer, AMO — no script allowed
    );
    paint(t.id, t.url);
  }
}
browser.runtime.onInstalled.addListener(adopt);
browser.runtime.onStartup.addListener(adopt);
