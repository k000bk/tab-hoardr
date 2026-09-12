const BATCH = 50;
const $ = id => document.getElementById(id);
const records = new Map();
// Storage keys, not checkbox state: render() replaces the result elements.
const selected = new Set();
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
  const identity = node('div', 'saved-item-main');
  const title = String(entry.title ?? '').trim();
  const url = readableUrl(entry);
  const key = KEY(entry.normUrl || normalize(entry.url || ''));

  const select = node('label', 'checkbox-row saved-item-select');
  const box = node('input');
  box.type = 'checkbox';
  box.checked = selected.has(key);
  box.setAttribute('aria-label', `Select ${title || url}`);
  box.addEventListener('change', () => {
    if (box.checked) selected.add(key); else selected.delete(key);
    syncForget();
  });
  select.append(box);

  const heading = node('h2', 'saved-item-title');
  const link = node('a');
  link.href = entry.url || entry.normUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<use href="icons.svg#link"></use>';
  link.append(node('span', '', title || url), icon);
  heading.append(link);
  const urlEl = node('div', 'saved-item-url', url);
  urlEl.title = String(entry.normUrl || entry.url || '');
  identity.append(heading, urlEl);
  head.append(select, identity, node('div', 'saved-item-date',
    `Added ${formatDate(entry.savedAt)} · Modified ${formatDate(entry.updatedAt)}`));
  article.append(head);

  const description = String(entry.description ?? '').trim();
  if (description) article.append(node('p', 'saved-item-description', description));

  const note = String(entry.note ?? '').trim();
  if (note) {
    const noteEl = node('div', 'saved-item-note');
    noteEl.append(node('strong', '', 'Note'), node('span', '', note));
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
  syncForget();
}

const syncForget = () => { $('forgetSelected').disabled = selected.size === 0; };

// A new search or sort can hide selected records, so it starts a new selection.
function resetAndRender() {
  visible = BATCH;
  selected.clear();
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

$('selectMode').addEventListener('click', () => {
  const on = document.body.classList.toggle('select-mode');
  $('selectMode').setAttribute('aria-pressed', String(on));
  $('forgetSelected').hidden = !on;
  selected.clear();
  render();
});

// background.js repaints badges and onChanged below updates the list; this only removes.
$('forgetSelected').addEventListener('click', async () => {
  const keys = [...selected];
  $('forgetSelected').disabled = true;
  try { await browser.storage.local.remove(keys); } finally { selected.clear(); render(); }
});

// Display choices only hide fields with CSS. Search still reads every field.
const choices = [...document.querySelectorAll('.display-option input')];
const [titleChoice, urlChoice] = choices;
for (const choice of choices) choice.addEventListener('change', () => {
  if (!titleChoice.checked && !urlChoice.checked) choice.checked = true;
  document.body.classList.toggle(`hide-${choice.value}`, !choice.checked);
  const shown = choices.filter(c => c.checked).length;
  $('displaySummary').textContent = shown === choices.length ? 'All fields' : `${shown} shown`;
  titleChoice.disabled = !urlChoice.checked;
  urlChoice.disabled = !titleChoice.checked;
});
addEventListener('click', event => {
  if (!$('displayMenu').contains(event.target)) $('displayMenu').open = false;
});

addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('displayMenu').open) {
    $('displayMenu').open = false;
    $('displayMenu').querySelector('summary').focus();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
  event.preventDefault();
  $('search').focus();
  $('search').select();
});

// Changes already contain the new records, so an open library can refresh
// without reading the complete storage area again.
const applyChanges = changes => {
  let relevant = false;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith('t:')) continue;
    relevant = true;
    if (change.newValue === undefined) { records.delete(key); selected.delete(key); }
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
