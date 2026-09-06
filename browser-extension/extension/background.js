// The toolbar checkmark is the only marker. Drawing into the page was never
// reliable — a site's own CSS, its framework and its Trusted Types policy all
// get a vote — so nothing is injected any more. The popup tells saved from
// hoarded; the badge only says "this page is saved".
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
  // Bulk save opens no editor and says nothing: the badges tick over by
  // themselves, through the storage.onChanged listener below.
  if (name === 'save-all-tabs') return void saveAll(await browser.tabs.query({ currentWindow: true }));
  if (name !== 'save-tab') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) openEditor(tab.id);
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

// The per-tab badge is the browser's state, not ours: it is blank again after a
// restart and after an update, so every open tab needs one repaint.
async function repaintAll() {
  for (const t of await browser.tabs.query({})) if (t.url) paint(t.id, t.url);
}
browser.runtime.onInstalled.addListener(repaintAll);
browser.runtime.onStartup.addListener(repaintAll);
