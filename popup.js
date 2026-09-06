// Toolbar menu. Saves nothing itself — "Save current tab" hands off to the
// background script, which owns the editor window.
const $ = id => document.getElementById(id);
let tab, key, entry, hoardedTabs = [];

const all = async () =>
  Object.entries(await browser.storage.local.get(null))
    .filter(([k]) => k.startsWith('t:'))
    .map(([, v]) => v);

// Single source of truth for every label and disabled state in the menu.
async function refresh() {
  entry = key ? (await browser.storage.local.get(key))[key] : undefined;

  const label = !key ? "can't hoard" : !entry ? 'not saved'
    : state(entry) === 'clean' ? 'hoarded' : 'saved';
  $('badge').textContent = label;
  $('badge').className = label === 'saved' ? 'saved' : label === 'hoarded' ? 'hoarded' : '';
  $('save').textContent = entry ? 'Edit saved tab' : 'Save current tab';
  $('save').disabled = !key;
  $('forget').hidden = !entry;

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

$('save').addEventListener('click', () => {
  const f = $('editor');
  f.onload = () => {
    f.style.height = f.contentDocument.documentElement.scrollHeight + 'px';
    f.contentWindow.focus();
  };
  f.src = `editor.html?tab=${tab.id}`;
  $('menu').hidden = true;
  f.hidden = false;
});
$('forget').addEventListener('click', async () => {
  await browser.storage.local.remove(key);
  await refresh();
});
$('prefs').addEventListener('click', () => browser.runtime.openOptionsPage());

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

  const stampMs = Date.now();
  await browser.storage.local.set(
    Object.fromEntries(pending.map(e => [KEY(e.normUrl), { ...e, exportedAt: stampMs }]))
  );
  await refresh();
  $('status').textContent = `exported ${pending.length}`;
});
