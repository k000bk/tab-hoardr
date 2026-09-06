// Resolve the tab URL once. The badge marks any saved entry; the page pill is
// reserved for fully exported entries, where "hoarded" means safe to close.
browser.browserAction.setBadgeBackgroundColor({ color: '#9b6df2' });
browser.browserAction.setBadgeTextColor?.({ color: '#ffffff' });

async function entryFor(url) {
  if (!hoardable(url)) return null;
  const k = KEY(normalize(url));
  return (await browser.storage.local.get(k))[k] || null;
}

async function paint(tabId, url) {
  const entry = await entryFor(url);
  browser.browserAction.setBadgeText({ tabId, text: entry ? '✓' : '' }).catch(() => {});
  const hoarded = entry && state(entry) === 'clean' ? entry : null;
  browser.tabs.sendMessage(tabId, { show: hoarded }).catch(() => {});
}

// --- editor window ---------------------------------------------------------
// A standalone window, not a browser_action popup: centred on the browser window
// and immune to focus loss. Opened by the keyboard shortcut and by the menu.
const EDITOR = { w: 400, h: 450 };
let editorWin = null;

async function openEditor(tabId) {
  // Centred on the browser window the user is looking at — not screen 0, and
  // never on the editor popup itself, hence type === 'normal'.
  const wins = await browser.windows.getAll();
  const win = wins.find(w => w.type === 'normal' && w.focused) || wins.find(w => w.type === 'normal');
  const left = Math.round((win?.left ?? 0) + ((win?.width ?? screen.availWidth) - EDITOR.w) / 2);
  const top = Math.round((win?.top ?? 0) + ((win?.height ?? screen.availHeight) - EDITOR.h) / 2);

  if (editorWin !== null) await browser.windows.remove(editorWin).catch(() => {}); // no stacking
  editorWin = (await browser.windows.create({
    url: browser.runtime.getURL(`editor.html?tab=${tabId}`),
    type: 'popup', width: EDITOR.w, height: EDITOR.h, left, top
  })).id;
}
browser.windows.onRemoved.addListener(id => { if (id === editorWin) editorWin = null; });

browser.commands.onCommand.addListener(async name => {
  if (name !== 'save-tab') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) openEditor(tab.id);
});

// A freshly loaded content script asks what to draw. sender.tab.url — not the
// page's own location.href, which SPAs rewrite out from under it.
browser.runtime.onMessage.addListener((msg, sender) =>
  msg === 'hello'
    ? entryFor(sender.tab?.url).then(entry => entry && state(entry) === 'clean' ? entry : null)
    : undefined
);

browser.tabs.onUpdated.addListener((tabId, ch, tab) => {
  // ch.url alone covers pushState/replaceState; status covers real loads.
  if (ch.url || ch.status === 'complete') paint(tabId, tab.url);
});

browser.tabs.onActivated.addListener(({ tabId }) =>
  browser.tabs.get(tabId).then(t => paint(tabId, t.url), () => {})
);

browser.storage.onChanged.addListener(async changes => {
  for (const t of await browser.tabs.query({})) {
    if (t.url && changes[KEY(normalize(t.url))]) paint(t.id, t.url);
  }
});

// Content scripts only inject into pages loaded after the extension. Tabs open
// before that (all of them, after a temporary-addon reload) need a hand.
async function adopt() {
  for (const t of await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    browser.tabs
      .sendMessage(t.id, 'ping')
      .then(() => paint(t.id, t.url))
      // about:, view-source:, PDF viewer, AMO — no script allowed, badge only.
      .catch(() => browser.tabs.executeScript(t.id, { file: 'content.js' }).catch(() => {}));
  }
}
browser.runtime.onInstalled.addListener(adopt);
browser.runtime.onStartup.addListener(adopt);
