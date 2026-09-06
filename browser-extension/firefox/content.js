// Dumb renderer. The background script decides what (if anything) to show —
// it is the only place a tab's URL is resolved, so the pill can never disagree
// with the toolbar badge. No storage access, no URL parsing, no lib.js.
(() => {
  let host, pill;

  const PILL = 'display:block;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;' +
    'color:#f0eaff;background:rgba(59,36,86,.94);border:1px solid #b69cf6;border-radius:999px;' +
    'padding:6px 9px;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;' +
    'user-select:none';

  function render(entry) {
    if (!entry) { host?.remove(); host = pill = null; return; }
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;left:12px;bottom:12px;z-index:2147483647';
      // createElement + textContent, never innerHTML: YouTube (and any site with
      // `require-trusted-types-for 'script'`) throws on innerHTML, and an inline
      // <style> element would additionally be at the mercy of the page's style-src.
      pill = document.createElement('b');
      pill.style.cssText = PILL;
      host.attachShadow({ mode: 'closed' }).appendChild(pill);
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
    pill.textContent = '✦ hoarded' + (entry.tags?.length ? ' · ' + entry.tags.join(' · ') : '');
    pill.title = entry.note || '';
  }

  browser.runtime.onMessage.addListener(msg => {
    if (msg === 'ping') return Promise.resolve(true);
    if (msg === 'meta') {
      const m = s => document.querySelector(s)?.content?.trim() || '';
      return Promise.resolve({
        title: document.title || '',
        description:
          m('meta[name="description" i]') ||
          m('meta[property="og:description" i]') ||
          m('meta[name="twitter:description" i]')
      });
    }
    if (msg && 'show' in msg) render(msg.show);
  });

  const hello = () => browser.runtime.sendMessage('hello').then(e => render(e || null), () => {});
  hello();
  addEventListener('pageshow', e => e.persisted && hello()); // back/forward cache

  // Some frameworks sweep unexpected children of <html> on hydrate.
  new MutationObserver(() => {
    if (host && !host.isConnected) document.documentElement.appendChild(host);
  }).observe(document.documentElement, { childList: true });
})();
