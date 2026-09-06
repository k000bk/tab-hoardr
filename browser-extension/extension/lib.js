// Shared by background, content script and popup.

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

// Numeric per dot-part, missing parts count as 0: 0.2.10 is newer than 0.2.9.
const isNewer = (a, b) => {
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d > 0;
  }
  return false;
};

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

if (typeof module !== 'undefined') module.exports = { normalize, KEY, state, hoardable, isNewer };
