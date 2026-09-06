// Shared by background, content script and popup.

const DROP = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[ce]id|igshid|ref|ref_src|si|s|spm)$/i;

const hoardable = url => /^https?:\/\//i.test(url || '');

// Storage layout: one storage.local key per entry, `t:<normalized url>`.
// Lookup by URL is a single indexed get — no full-blob rewrite on save.
const KEY = normUrl => 't:' + normUrl;

function normalize(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    for (const p of [...u.searchParams.keys()]) if (DROP.test(p)) u.searchParams.delete(p);
    const q = u.searchParams.toString();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.protocol + '//' + u.host + u.pathname + (q ? '?' + q : '');
  } catch {
    return raw;
  }
}

// new = never exported; update = edited since its last export.
const state = e => (!e.exportedAt ? 'new' : e.updatedAt > e.exportedAt ? 'update' : 'clean');

if (typeof module !== 'undefined') module.exports = { normalize, KEY, state, hoardable };
