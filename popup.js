const $ = id => document.getElementById(id);
const now = () => Date.now();
let tab, key, entry, hoardedTabs = [];

const all = async () =>
  Object.entries(await browser.storage.local.get(null))
    .filter(([k]) => k.startsWith('t:'))
    .map(([, v]) => v);

// --- menu ------------------------------------------------------------------
// Single source of truth for every button/label in the menu. Called on open and
// after anything that can change storage or the set of open tabs.
async function refresh() {
  entry = key ? (await browser.storage.local.get(key))[key] : undefined;

  const label = !key ? "can't hoard" : !entry ? 'not saved'
    : state(entry) === 'clean' ? 'hoarded' : 'saved';
  $('badge').textContent = label;
  $('badge').className = label === 'saved' ? 'saved' : label === 'hoarded' ? 'hoarded' : '';
  $('save').textContent = entry ? 'Edit saved tab' : 'Save current tab';
  $('save').disabled = !key;

  const entries = await all();
  const pending = entries.filter(e => state(e) !== 'clean');
  $('export').disabled = !pending.length;

  // Exported and not flagged "keep tab on export" — closing loses nothing.
  const done = new Set(entries.filter(e => e.exportedAt && !e.pinned).map(e => e.normUrl));
  hoardedTabs = (await browser.tabs.query({}))
    .filter(t => !t.pinned && t.url && done.has(normalize(t.url)));
  $('closeHoarded').disabled = !hoardedTabs.length;
  $('closeHoarded').textContent = hoardedTabs.length
    ? `Close ${hoardedTabs.length} hoarded tab${hoardedTabs.length > 1 ? 's' : ''}`
    : 'Close hoarded tabs';

  $('status').textContent = pending.length ? `${pending.length} ready to export` : 'nothing new';
}

(async () => {
  [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && hoardable(tab.url)) key = KEY(normalize(tab.url));
  $('host').textContent = key ? normalize(tab.url) : tab?.url || '';
  await refresh();
})();

// --- editor ----------------------------------------------------------------
async function openEditor() {
  if (!entry) {
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
  $('editorHost').textContent = entry.normUrl;
  $('description').value = entry.description;
  $('note').value = entry.note;
  $('tags').value = entry.tags.join(', ');
  $('pinned').checked = entry.pinned;
  $('menu').hidden = true;
  $('editor').hidden = false;
  $('note').focus();
}

let t;
const patch = () => {
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

$('note').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); patch(); setTimeout(window.close, 200); }
});
$('tags').addEventListener('keydown', e => {
  if (e.key === 'Enter') { patch(); setTimeout(window.close, 200); }
});
$('save').addEventListener('click', openEditor);
$('back').addEventListener('click', async () => {
  patch();
  $('editor').hidden = true;
  $('menu').hidden = false;
  await refresh();
});
$('prefs').addEventListener('click', () => browser.runtime.openOptionsPage());
$('forget').addEventListener('click', async () => {
  await browser.storage.local.remove(key);
  window.close();
});
// Two-click confirm. window.confirm() from a browser_action popup can dismiss
// the popup itself, taking the pending click with it.
let armed = false;
$('closeHoarded').addEventListener('click', async () => {
  if (!armed) {
    armed = true;
    $('closeHoarded').textContent = `Really close ${hoardedTabs.length}?`;
    setTimeout(() => { if (armed) { armed = false; refresh(); } }, 3000);
    return;
  }
  await browser.tabs.remove(hoardedTabs.map(t => t.id));
  window.close();
});

// --- export ----------------------------------------------------------------
// ponytail: polls download state instead of onChanged — no listener race, 10s ceiling.
async function settled(id) {
  for (let i = 0; i < 100; i++) {
    const [d] = await browser.downloads.search({ id });
    if (!d || d.state !== 'in_progress') return d?.state === 'complete';
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

$('export').addEventListener('click', async () => {
  const btn = $('export');
  btn.disabled = true;
  const pending = (await all()).filter(e => state(e) !== 'clean');
  if (!pending.length) return refresh();

  const stamp = new Date();
  const p = n => String(n).padStart(2, '0');
  const name =
    `${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}` +
    `-${p(stamp.getHours())}${p(stamp.getMinutes())}_hoardr-session.json`;

  const payload = {
    exportedAt: stamp.toISOString(),
    items: pending.map(e => ({
      state: state(e),
      url: e.url,
      title: e.title,
      description: e.description,
      note: e.note,
      tags: e.tags,
      savedAt: new Date(e.savedAt).toISOString(),
      updatedAt: new Date(e.updatedAt).toISOString()
    }))
  };

  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  $('status').textContent = 'exporting…';
  const id = await browser.downloads.download({ url, filename: name, saveAs: false });
  if (!(await settled(id))) { $('status').textContent = 'download failed'; btn.disabled = false; return; }

  const stampMs = now();
  await browser.storage.local.set(
    Object.fromEntries(pending.map(e => [KEY(e.normUrl), { ...e, exportedAt: stampMs }]))
  );
  await refresh();
  $('status').textContent = `exported ${pending.length}`;
});
