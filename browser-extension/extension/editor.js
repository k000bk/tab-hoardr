// Standalone window (windows.create), not an action popup — it is centred
// on the browser window and survives losing focus. The tab it edits is passed in
// the query string; this page never asks "which tab is active?", because by the
// time it has focus, it *is* the active thing.
const $ = id => document.getElementById(id);
const now = () => Date.now();
let key, entry;

if (top !== window) document.body.classList.add('embedded');

// Fit to the form so the buttons are never cut off — called once the fields are
// filled, because an empty #host is 0px tall and a filled one is a line of text.
// Same origin, so embedded in the toolbar panel this sizes the iframe directly;
// popup.js only sets a starting height, before this page has its content.
async function fit() {
  if (top !== window) { frameElement.style.height = document.documentElement.scrollHeight + 'px'; return; }
  // Standalone: the title bar is measured, not guessed — it is not the same
  // height in Chrome as in Firefox, and the fields grow with the interface font.
  const wanted = document.documentElement.scrollHeight + (outerHeight - innerHeight);
  if (Math.abs(wanted - outerHeight) < 3) return;
  const win = await browser.windows.getCurrent();
  browser.windows.update(win.id, { height: wanted }).catch(() => {});
}

(async () => {
  const tabId = Number(new URLSearchParams(location.search).get('tab'));
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab || !hoardable(tab.url)) {
    $('editorForm').hidden = true;
    $('fallback').hidden = false;
    fit();
    return;
  }

  key = KEY(normalize(tab.url));
  entry = (await browser.storage.local.get(key))[key];
  const existing = Boolean(entry);
  if (!existing) {
    entry = newEntry(tab, await readMeta(tab.id));
    await browser.storage.local.set({ [key]: entry });
  }

  $('title').value = entry.title;
  $('host').textContent = entry.normUrl;
  $('host').title = entry.normUrl;
  $('description').value = entry.description;
  $('note').value = entry.note;
  $('tags').value = entry.tags.join(', ');
  $('pinned').checked = entry.pinned;
  $('editorHeading').textContent = existing ? 'Edit saved tab' : 'Save current tab';
  $('note').focus();
  fit();
})();

let t;
const patch = () => {
  if (!entry || !key) return;
  clearTimeout(t);
  t = setTimeout(async () => {
    const before = content(entry);
    entry.title = $('title').value.trim();
    entry.description = $('description').value.trim();
    entry.note = $('note').value.trim();
    entry.tags = $('tags').value.split(',').map(s => s.trim()).filter(Boolean);
    entry.pinned = $('pinned').checked;
    // Only exported content moves the clock. Toggling "keep tab on export", or
    // typing a word and deleting it again, leaves a Hoarded tab hoarded.
    if (content(entry) !== before) entry.updatedAt = now();
    await browser.storage.local.set({ [key]: entry });
  }, 150);
};
for (const el of ['title', 'description', 'note', 'tags', 'pinned']) $(el).addEventListener('input', patch);

// top, not window: embedded in the toolbar panel this closes the panel; opened as
// a standalone window top === window and it closes that.
const close = () => { patch(); setTimeout(() => top.close(), 200); };
$('save').addEventListener('click', close);
$('closeEditor').addEventListener('click', close);
$('forget').addEventListener('click', async () => {
  await browser.storage.local.remove(key);
  top.close();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') return close();
  // Enter commits everywhere except the description, where newlines are the point.
  if (e.key === 'Enter' && !e.shiftKey && e.target.id !== 'description') { e.preventDefault(); close(); }
});
