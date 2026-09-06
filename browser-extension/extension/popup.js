// Toolbar menu. "Save current tab" hands off to the background script, which
// owns the editor window; the bulk save writes storage here and now.
const $ = id => document.getElementById(id);
let tab, key, entry, hoardedTabs = [];

const icon = (id, name) => $(id).setAttribute('href', `icons.svg#${name}`);
const feedback = (text, kind = '') => {
  $('status').textContent = text;
  $('status').setAttribute('aria-busy', kind === 'progress' ? 'true' : 'false');
  if (kind) $('status').dataset.state = kind;
  else delete $('status').dataset.state;
};

const all = async (store) =>
  Object.entries(store ?? await browser.storage.local.get(null))
    .filter(([k]) => k.startsWith('t:'))
    .map(([, v]) => v);

// Single source of truth for every label and disabled state in the menu.
async function refresh() {
  const store = await browser.storage.local.get(null);
  entry = key ? store[key] : undefined;

  const label = !key ? 'unavailable' : !entry ? 'not-saved'
    : state(entry) === 'clean' ? 'hoarded' : 'saved';
  const card = {
    unavailable: ['Can’t save this page', 'The browser does not allow access here.', 'ban'],
    'not-saved': ['Not saved', 'Ready to add to your next export.', 'plus'],
    saved: ['Saved', 'Changes are waiting for export.', 'check'],
    hoarded: ['Hoarded', 'Exported and safe to close.', 'archive']
  }[label];
  $('badge').className = `status-card ${label === 'not-saved' ? '' : label}`.trim();
  $('statusTitle').textContent = card[0];
  $('statusDetail').textContent = card[1];
  icon('statusIcon', card[2]);
  $('saveLabel').textContent = entry ? 'Edit saved tab' : 'Save current tab';
  icon('saveIcon', entry ? 'edit' : 'plus');
  $('save').disabled = !key;
  $('forget').hidden = !entry;

  // What the bulk button would actually write: hoardable, not saved yet, and
  // counted once per page — two tabs of one article are one record.
  const unsaved = new Set((await browser.tabs.query({ currentWindow: true }))
    .filter(t => hoardable(t.url) && !(KEY(normalize(t.url)) in store))
    .map(t => normalize(t.url))).size;
  $('saveAll').disabled = !unsaved;
  $('saveAllLabel').textContent = unsaved
    ? `Save all opened tabs (${unsaved})`
    : 'All opened tabs are saved';

  const entries = await all(store);
  const pending = entries.filter(e => state(e) !== 'clean');
  $('export').disabled = !pending.length;

  // Fully exported and not flagged "keep tab on export" — safe to close.
  // An entry edited after export is Saved again, not Hoarded.
  const done = new Set(entries.filter(e => state(e) === 'clean' && !e.pinned).map(e => e.normUrl));
  hoardedTabs = (await browser.tabs.query({}))
    .filter(t => !t.pinned && t.url && done.has(normalize(t.url)));
  $('closeHoarded').disabled = !hoardedTabs.length;
  $('closeLabel').textContent = hoardedTabs.length
    ? `Close ${hoardedTabs.length} hoarded tab${hoardedTabs.length > 1 ? 's' : ''}`
    : 'Close hoarded tabs';
  $('closeHoarded').classList.remove('danger');
  icon('closeIcon', 'x');

  feedback(pending.length ? `${pending.length} ready to export` : 'Nothing new');
}

(async () => {
  [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && hoardable(tab.url)) key = KEY(normalize(tab.url));
  $('host').textContent = key ? normalize(tab.url) : tab?.url || '';
  $('host').title = $('host').textContent;
  await refresh();
})();

$('save').addEventListener('click', () => {
  const f = $('editor');
  // Starting height only; editor.js re-fits once its fields are filled.
  f.onload = () => {
    f.style.height = f.contentDocument.documentElement.scrollHeight + 'px';
    f.contentWindow.focus();
  };
  f.src = `editor.html?tab=${tab.id}`;
  $('menu').hidden = true;
  f.hidden = false;
});
// Bulk save. No editor, no per-tab questions — the user hoards the windowful
// and edits the few that matter later. Tabs already saved keep their notes.
$('saveAll').addEventListener('click', async () => {
  $('saveAll').disabled = true;
  feedback('Saving every tab…', 'progress');
  const n = await saveAll(await browser.tabs.query({ currentWindow: true }));
  await refresh();
  feedback(n ? `Saved ${n} tab${n > 1 ? 's' : ''}` : 'Every tab was already saved', n ? 'success' : '');
});
$('forget').addEventListener('click', async () => {
  await browser.storage.local.remove(key);
  await refresh();
});
$('prefs').addEventListener('click', () => browser.runtime.openOptionsPage());

// Weekly, cached, off the critical path — a failure (offline, rate limit) just
// leaves the pill hidden.
checkUpdate().then(u => {
  if (!u.newer) return;
  $('update').href = RELEASES_URL;
  $('update').title = `Version ${u.latest} is available — you have ${u.version}`;
  $('update').hidden = false;
}).catch(() => {});

// Two-click confirm. window.confirm() from a browser_action popup can dismiss
// the popup itself, taking the pending click with it.
let armed = false;
$('closeHoarded').addEventListener('click', async () => {
  if (!armed) {
    armed = true;
    $('closeLabel').textContent = `Really close ${hoardedTabs.length}?`;
    $('closeHoarded').classList.add('danger');
    icon('closeIcon', 'alert');
    feedback('Click again to confirm', 'warning');
    setTimeout(() => { if (armed) { armed = false; refresh(); } }, 3000);
    return;
  }
  await browser.tabs.remove(hoardedTabs.map(t => t.id));
  window.close();
});

// --- export ----------------------------------------------------------------
$('export').addEventListener('click', async () => {
  const btn = $('export');
  btn.disabled = true;
  const pending = (await all()).filter(e => state(e) !== 'clean');
  if (!pending.length) { await refresh(); feedback('Nothing new to export'); return; }

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
  feedback(`Exporting ${pending.length} saved tab${pending.length > 1 ? 's' : ''}…`, 'progress');
  try {
    const id = await browser.downloads.download({ url, filename: name, saveAs: false });
    if (!(await settled(id))) throw new Error('Download failed');
    const stampMs = Date.now();
    await browser.storage.local.set(
      Object.fromEntries(pending.map(e => [KEY(e.normUrl), { ...e, exportedAt: stampMs }]))
    );
    await refresh();
    feedback(`Exported ${pending.length} saved tab${pending.length > 1 ? 's' : ''}`, 'success');
  } catch {
    feedback('Download failed. Try again.', 'error');
    btn.disabled = false;
  } finally {
    URL.revokeObjectURL(url);
  }
});
