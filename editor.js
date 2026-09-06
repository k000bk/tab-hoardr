// Standalone window (windows.create), not a browser_action popup — it is centred
// on the browser window and survives losing focus. The tab it edits is passed in
// the query string; this page never asks "which tab is active?", because by the
// time it has focus, it *is* the active thing.
const $ = id => document.getElementById(id);
const now = () => Date.now();
let key, entry;

if (top !== window) document.body.classList.add('embedded');

(async () => {
  const tabId = Number(new URLSearchParams(location.search).get('tab'));
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab || !hoardable(tab.url)) {
    $('editorForm').hidden = true;
    $('fallback').hidden = false;
    return;
  }

  key = KEY(normalize(tab.url));
  entry = (await browser.storage.local.get(key))[key];
  const existing = Boolean(entry);
  if (!existing) {
    const meta = await browser.tabs.sendMessage(tab.id, 'meta').catch(() => ({}));
    entry = {
      url: tab.url,
      normUrl: normalize(tab.url),
      title: meta.title || tab.title || '',
      description: meta.description || '',
      note: '',
      tags: [],
      pinned: false,
      savedAt: now(),
      updatedAt: now(),
      exportedAt: null
    };
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
})();

let t;
const patch = () => {
  if (!entry || !key) return;
  clearTimeout(t);
  t = setTimeout(async () => {
    entry.title = $('title').value.trim();
    entry.description = $('description').value.trim();
    entry.note = $('note').value.trim();
    entry.tags = $('tags').value.split(',').map(s => s.trim()).filter(Boolean);
    entry.pinned = $('pinned').checked;
    entry.updatedAt = now();
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
