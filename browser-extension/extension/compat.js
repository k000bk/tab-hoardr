// Chrome has no `browser` object; its `chrome` APIs are promise-based under MV3,
// so aliasing is the whole port. Loaded first everywhere, including content scripts.
globalThis.browser ??= globalThis.chrome;
