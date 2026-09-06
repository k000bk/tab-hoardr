// Badge on the page itself + meta scraper for the popup.
// Wrapped so a re-injection into an already-injected tab is a harmless no-op.
(() => {
  let key, host, pill;

  const meta = s => document.querySelector(s)?.content?.trim() || '';

  browser.runtime.onMessage.addListener(msg => {
    if (msg === 'ping') return Promise.resolve(true);
    if (msg === 'sync') { sync(); return; }
    if (msg === 'meta')
      return Promise.resolve({
        title: document.title || '',
        description:
          meta('meta[name="description" i]') ||
          meta('meta[property="og:description" i]') ||
          meta('meta[name="twitter:description" i]')
      });
  });

  function render(entry) {
    if (!entry) {
      host?.remove();
      host = pill = null;
      return;
    }
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;left:12px;bottom:12px;z-index:2147483647';
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML =
        `<style>
          b{display:block;font:500 11px/1 ui-sans-serif,system-ui,sans-serif;color:#e7f6ec;
            background:#14532d;border:1px solid #16a34a;border-radius:999px;
            padding:5px 9px;box-shadow:0 2px 8px rgba(0,0,0,.35);
            white-space:nowrap;opacity:.85;user-select:none}
          b:hover{opacity:1}
         </style><b></b>`;
      pill = root.querySelector('b');
    }
    // Re-attach if the page wiped it, and hang off <html> rather than <body>
    // so frameworks that rebuild the body don't take it with them.
    if (!host.isConnected) document.documentElement.appendChild(host);
    pill.textContent = '✦ hoarded' + (entry.tags?.length ? ' · ' + entry.tags.join(' · ') : '');
    pill.title = entry.note || '';
  }

  async function sync() {
    key = KEY(normalize(location.href));
    render((await browser.storage.local.get(key))[key]);
  }

  browser.storage.onChanged.addListener(ch => key in ch && render(ch[key].newValue));
  addEventListener('pageshow', e => e.persisted && sync()); // back/forward cache
  sync();
})();
