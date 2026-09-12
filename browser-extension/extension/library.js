const BATCH = 50;
const $ = id => document.getElementById(id);
const records = new Map();
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
let visible = BATCH;
let searchTimer;
let loaded = false;
const queuedChanges = [];

const plural = n => n === 1 ? 'tab' : 'tabs';
const formatDate = value => {
  const d = new Date(Number(value));
  return Number.isNaN(d.getTime()) ? '—' : date.format(d);
};
const readableUrl = entry => String(entry.normUrl || normalize(entry.url || '')).replace(/^https?:\/\//i, '');
const node = (name, className, text) => {
  const el = document.createElement(name);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

function result(entry) {
  const article = node('article', 'saved-item');
  const head = node('div', 'saved-item-head');
  const identity = node('div');
  const title = String(entry.title ?? '').trim();
  const url = readableUrl(entry);
  if (title) identity.append(node('h2', 'saved-item-title', title));
  const urlEl = node('div', 'saved-item-url', url);
  urlEl.title = String(entry.normUrl || entry.url || '');
  identity.append(urlEl);
  head.append(identity, node('div', 'saved-item-date',
    `Added ${formatDate(entry.savedAt)} · Modified ${formatDate(entry.updatedAt)}`));
  article.append(head);

  const description = String(entry.description ?? '').trim();
  if (description) article.append(node('p', 'saved-item-description', description));

  const note = String(entry.note ?? '').trim();
  if (note) {
    const noteEl = node('div', 'saved-item-note');
    noteEl.append(node('strong', '', 'Note'), document.createTextNode(` ${note}`));
    article.append(noteEl);
  }

  const tags = Array.isArray(entry.tags) ? entry.tags.map(String).map(tag => tag.trim()).filter(Boolean) : [];
  if (tags.length) {
    const list = node('div', 'tag-list');
    list.setAttribute('aria-label', 'Tags');
    for (const tag of tags) list.append(node('span', 'tag', tag));
    article.append(list);
  }
  return article;
}

function emptyState(isLibraryEmpty) {
  const empty = node('div', 'empty-state');
  empty.append(
    node('strong', '', isLibraryEmpty ? 'No saved tabs yet' : 'No saved tabs match your search'),
    node('span', '', isLibraryEmpty
      ? 'Save a tab from the Tab Hoardr toolbar menu to add it here.'
      : 'Try a different title, description, note or tag.')
  );
  return empty;
}

function render() {
  const view = savedTabView([...records.values()], $('search').value,
    $('sortBy').value, $('sortOrder').value, visible);
  const shown = view.items.length;
  $('libraryCount').textContent = `${records.size.toLocaleString()} saved ${plural(records.size)}`;
  $('summary').textContent = `Showing ${shown.toLocaleString()} of ${view.total.toLocaleString()} saved ${plural(view.total)}`;
  $('results').replaceChildren(...(shown ? view.items.map(result) : [emptyState(records.size === 0)]));
  $('loadArea').hidden = view.remaining === 0;
  $('loadMore').disabled = view.remaining === 0;
  $('remaining').textContent = `${shown.toLocaleString()} loaded · ${view.remaining.toLocaleString()} remaining`;
}

function resetAndRender() {
  visible = BATCH;
  render();
}

$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(resetAndRender, 80);
});
$('sortBy').addEventListener('change', resetAndRender);
$('sortOrder').addEventListener('change', resetAndRender);
$('loadMore').addEventListener('click', () => { visible += BATCH; render(); });
$('options').addEventListener('click', () => browser.runtime.openOptionsPage());

addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
  event.preventDefault();
  $('search').focus();
  $('search').select();
});
$('searchShortcut').textContent = navigator.platform.startsWith('Mac') ? '⌘ K' : 'Ctrl K';

// Changes already contain the new records, so an open library can refresh
// without reading the complete storage area again.
const applyChanges = changes => {
  let relevant = false;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith('t:')) continue;
    relevant = true;
    if (change.newValue === undefined) records.delete(key);
    else records.set(key, change.newValue);
  }
  return relevant;
};
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!loaded) { queuedChanges.push(changes); return; }
  if (applyChanges(changes)) render();
});

(async () => {
  const store = await browser.storage.local.get(null);
  for (const [key, entry] of Object.entries(store)) if (key.startsWith('t:')) records.set(key, entry);
  for (const changes of queuedChanges) applyChanges(changes);
  queuedChanges.length = 0;
  loaded = true;
  render();
})();
