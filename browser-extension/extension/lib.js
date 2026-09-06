// Shared by the background script and every extension page.

// Tracking params only. Nothing ambiguous: `s` was here and is WordPress's
// search query — dropping it filed every search result page under one key.
const DROP = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[ce]id|igshid|ref|ref_src|si|spm)$/i;

const hoardable = url => /^https?:\/\//i.test(url || '');

// Storage layout: one storage.local key per entry, `t:<normalized url>`.
// Lookup by URL is a single indexed get — no full-blob rewrite on save.
const KEY = normUrl => 't:' + normUrl;

function normalize(raw) {
  try {
    const u = new URL(raw);
    // '#/route' and '#!/route' are hash routers — genuinely different pages.
    // '#section' is an anchor into the same page; keeping it files one article twice.
    if (!/^#!?\//.test(u.hash)) u.hash = '';
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    for (const p of [...u.searchParams.keys()]) if (DROP.test(p)) u.searchParams.delete(p);
    u.searchParams.sort(); // ?b=2&a=1 and ?a=1&b=2 are the same page
    const q = u.searchParams.toString();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.protocol + '//' + u.host + u.pathname + (q ? '?' + q : '') + u.hash;
  } catch {
    return raw;
  }
}

// new = never exported; update = edited since its last export.
const state = e => (!e.exportedAt ? 'new' : e.updatedAt > e.exportedAt ? 'update' : 'clean');

// Everything the export actually carries. `updatedAt` may only move when one of
// these changes, because `updatedAt` is what `state` reads. `pinned` is
// housekeeping and is exported nowhere: bumping the clock for it meant that
// unticking "keep tab on export" — the normal way to release a tab you have
// already exported — put that tab straight back into the next export.
const content = e => JSON.stringify([e.title, e.description, e.note, e.tags]);

// Numeric per dot-part, missing parts count as 0: 0.2.10 is newer than 0.2.9.
const isNewer = (a, b) => {
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d > 0;
  }
  return false;
};

// Restore rebuilds a record field by field from a file the user picked, never
// trusting it as-is: the storage key is re-derived from the record's own url, so
// a doctored key in the file cannot write anywhere else. Returns null for
// anything that is not a saved tab.
const restoreRecord = e => !e || typeof e.url !== 'string' || !hoardable(e.url) ? null : ({
  url: e.url,
  normUrl: normalize(e.url),
  title: String(e.title ?? ''),
  description: String(e.description ?? ''),
  note: String(e.note ?? ''),
  tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
  pinned: Boolean(e.pinned),
  savedAt: Number(e.savedAt) || Date.now(),
  updatedAt: Number(e.updatedAt) || Date.now(),
  exportedAt: Number(e.exportedAt) || null
});

// A download reports "started", not "written". Both callers tell the user their
// file is safe, so both wait for the real verdict.
// ponytail: polls download state instead of onChanged — no listener race, 10s ceiling.
async function settled(id) {
  for (let i = 0; i < 100; i++) {
    const [d] = await browser.downloads.search({ id });
    if (!d || d.state !== 'in_progress') return d?.state === 'complete';
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

// --- saving -----------------------------------------------------------------
// The page's own title and description, read once at save time. Injected on
// demand for one tab, because no content script stands by. It cannot run on
// about:, view-source:, the PDF viewer, AMO or the Chrome Web Store — there the
// caller falls back to tab.title and the description stays empty.
async function readMeta(tabId) {
  const [{ result } = {}] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const m = s => document.querySelector(s)?.content?.trim() || '';
      return {
        title: document.title || '',
        description:
          m('meta[name="description" i]') ||
          m('meta[property="og:description" i]') ||
          m('meta[name="twitter:description" i]')
      };
    }
  }).catch(() => []);
  return result || null;
}

const newEntry = (tab, meta) => {
  const t = Date.now();
  return {
    url: tab.url,
    normUrl: normalize(tab.url),
    title: meta?.title || tab.title || '',
    description: meta?.description || '',
    note: '',
    tags: [],
    pinned: false,
    savedAt: t,
    updatedAt: t,
    exportedAt: null
  };
};

// Bulk save, no editor: the user closes the tabs they do not want, then hoards
// the rest in one keypress and edits the few that matter later. A tab that is
// already saved is left exactly as it is — this never overwrites a note.
// Metadata is read from all of them at once, so one slow page does not hold up
// the others. Duplicates collapse, because two tabs of one page share a key.
async function saveAll(tabs) {
  const open = tabs.filter(t => hoardable(t.url));
  const store = await browser.storage.local.get(open.map(t => KEY(normalize(t.url))));
  const todo = open.filter(t => !store[KEY(normalize(t.url))]);
  const entries = await Promise.all(todo.map(async t => newEntry(t, await readMeta(t.id))));
  const write = Object.fromEntries(entries.map(e => [KEY(e.normUrl), e]));
  const n = Object.keys(write).length;
  if (n) await browser.storage.local.set(write);
  return n;
}

const REPO = 'k000bk/tab-hoardr';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const UPDATE_KEY = 'updateCheck';

// One unauthenticated GitHub call per week, cached in storage — the popup asks
// on every open, so without the cache a heavy popup user would hit the 60/h
// rate limit. Throws when the call fails; silent callers ignore it.
async function checkUpdate(force) {
  const version = browser.runtime.getManifest().version;
  const cached = (await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY];
  // Recompute against the running version: the cache outlives an extension update.
  if (!force && cached && Date.now() - cached.at < 7 * 24 * 60 * 60 * 1000)
    return { ...cached, version, newer: isNewer(cached.latest, version) };

  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'No release published on GitHub yet.' : `GitHub answered ${r.status}.`);
  const tag = String((await r.json()).tag_name || '');
  const latest = tag.replace(/^v/, '').split('-')[0];   // v0.3.0-beta.1 -> 0.3.0
  const result = { at: Date.now(), version, latest, newer: isNewer(latest, version) };
  await browser.storage.local.set({ [UPDATE_KEY]: result });
  return result;
}

if (typeof module !== 'undefined') module.exports = { normalize, KEY, state, hoardable, isNewer, restoreRecord, newEntry, content };
