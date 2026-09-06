// Chrome has no `browser` object; its `chrome` APIs are promise-based under MV3,
// so aliasing is the whole port. Loaded first in every context: pages and `sw.js`.
globalThis.browser ??= globalThis.chrome;
