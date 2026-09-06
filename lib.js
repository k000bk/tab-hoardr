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

if (typeof module !== 'undefined') module.exports = { normalize, KEY, state, hoardable };
