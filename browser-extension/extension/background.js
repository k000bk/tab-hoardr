// Resolve the tab URL once. The badge marks any saved entry; the page pill is
// reserved for fully exported entries, where "hoarded" means safe to close.
browser.action.setBadgeBackgroundColor({ color: '#9b6df2' });
browser.action.setBadgeTextColor?.({ color: '#ffffff' }); // not in older Chrome

async function entryFor(url) {
  if (!hoardable(url)) return null;
  const k = KEY(normalize(url));
  return (await browser.storage.local.get(k))[k] || null;
}

async function paint(tabId, url) {
  const entry = await entryFor(url);
  browser.action.setBadgeText({ tabId, text: entry ? '✓' : '' }).catch(() => {});
  const hoarded = entry && state(entry) === 'clean' ? entry : null;
  browser.tabs.sendMessage(tabId, { show: hoarded }).catch(() => {});
}

// --- editor window ---------------------------------------------------------
// A standalone window, not an action popup: centred on the browser window and
// immune to focus loss. Opened by the keyboard shortcut and by the menu.
// The form needs 417px of viewport. This opening height clears that in both
// browsers even if the fit() in editor.js cannot run; fit() then trims the rest.
const EDITOR = { w: 400, h: 480 };

async function openEditor(tabId) {
  // Centred on the browser window the user is looking at — not screen 0, and
  // never on the editor popup itself, hence type === 'normal'. A service worker
  // has no `screen`, so the last-resort size is a plain number.
  const wins = await browser.windows.getAll({ populate: true });
  const win = wins.find(w => w.type === 'normal' && w.focused) || wins.find(w => w.type === 'normal');
  const left = Math.round((win?.left ?? 0) + ((win?.width ?? 1280) - EDITOR.w) / 2);
  const top = Math.round((win?.top ?? 0) + ((win?.height ?? 800) - EDITOR.h) / 2);

  // No stacking. Found by URL, not by a remembered id: Chrome stops the service
  // worker when idle, which would forget the id. The popup's iframe is not a tab,
  // so the menu's embedded copy never matches here.
  const editorUrl = browser.runtime.getURL('editor.html');
  for (const w of wins) {
    if (w.tabs?.some(t => t.url?.startsWith(editorUrl))) await browser.windows.remove(w.id).catch(() => {});
  }

  browser.windows.create({
    url: `${editorUrl}?tab=${tabId}`,
    type: 'popup', width: EDITOR.w, height: EDITOR.h, left, top
  });
}

browser.commands.onCommand.addListener(async name => {
  if (name !== 'save-tab') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) openEditor(tab.id);
});

// A freshly loaded content script asks what to draw. sender.tab.url — not the
// page's own location.href, which SPAs rewrite out from under it.
// sendResponse + `return true`, not a returned promise: Chrome ignores promises here.
browser.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg !== 'hello') return;
  entryFor(sender.tab?.url).then(entry => respond(entry && state(entry) === 'clean' ? entry : null));
  return true;
});

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
      // about:, view-source:, PDF viewer, AMO, the Chrome Web Store — no script
      // allowed there, badge only.
      .catch(() =>
        browser.scripting
          .executeScript({ target: { tabId: t.id }, files: ['compat.js', 'content.js'] })
          .catch(() => {})
      );
  }
}
browser.runtime.onInstalled.addListener(adopt);
browser.runtime.onStartup.addListener(adopt);
