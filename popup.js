const $ = id => document.getElementById(id);
const now = () => Date.now();
let entry, key;

// --- save / edit the active tab -------------------------------------------
(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !hoardable(tab.url)) {
    $('title').textContent = "Can't hoard this page";
    $('host').textContent = tab?.url || '';
    count();
    return;
  }

  key = KEY(normalize(tab.url));
  entry = (await browser.storage.local.get(key))[key];
  const fresh = !entry;

  if (fresh) {
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

  $('title').textContent = entry.title || entry.normUrl;
  $('host').textContent = entry.normUrl;
  $('title').insertAdjacentHTML(
    'beforeend',
    fresh ? '<span class="tag">new</span>'
      : entry.exportedAt ? '<span class="tag upd">exported</span>'
      : '<span class="tag">saved</span>'
  );
  $('note').value = entry.note;
  $('tags').value = entry.tags.join(', ');
  $('pinned').checked = entry.pinned;
  $('form').hidden = false;
  $('note').focus();
  count();
})();

let t;
const patch = () => {
  clearTimeout(t);
  t = setTimeout(async () => {
    entry.note = $('note').value.trim();
    entry.tags = $('tags').value.split(',').map(s => s.trim()).filter(Boolean);
    entry.pinned = $('pinned').checked;
    entry.updatedAt = now();
    await browser.storage.local.set({ [key]: entry });
    count();
  }, 150);
};
for (const el of ['note', 'tags', 'pinned']) $(el).addEventListener('input', patch);

$('note').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); patch(); setTimeout(window.close, 200); }
});
$('tags').addEventListener('keydown', e => {
  if (e.key === 'Enter') { patch(); setTimeout(window.close, 200); }
});
$('prefs').addEventListener('click', () => browser.runtime.openOptionsPage());
$('forget').addEventListener('click', async () => {
  await browser.storage.local.remove(key);
  window.close();
});

// --- export ----------------------------------------------------------------
const all = async () =>
  Object.entries(await browser.storage.local.get(null))
    .filter(([k]) => k.startsWith('t:'))
    .map(([, v]) => v);

async function count() {
  const pending = (await all()).filter(e => state(e) !== 'clean').length;
  $('status').textContent = pending ? `${pending} to export` : 'nothing new';
}

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
  if (!pending.length) { $('status').textContent = 'nothing to export'; btn.disabled = false; return; }

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

  const urls = new Set(pending.filter(e => !e.pinned).map(e => e.normUrl));
  const tabs = (await browser.tabs.query({}))
    .filter(t => !t.pinned && t.url && urls.has(normalize(t.url)));

  $('status').textContent = `exported ${pending.length}`;
  const next = btn.cloneNode(true); // drops the export listener
  next.disabled = false;
  btn.replaceWith(next);
  if (!tabs.length) { next.textContent = 'Done'; next.onclick = window.close; return; }
  next.textContent = `Close ${tabs.length} tabs`;
  next.onclick = async () => { await browser.tabs.remove(tabs.map(t => t.id)); window.close(); };
});
