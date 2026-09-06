# Tab Hoardr

Hoard tabs → export one JSON → feed it to your Obsidian CLI agent.

## Install

Signed builds are on the [Releases page](../../../../releases). In Firefox open
`about:addons`, click the gear icon, then **Install Add-on From File**.

## Develop

Load it live: `about:debugging#/runtime/this-firefox` -> **Load Temporary
Add-on** -> pick `manifest.json`. This version goes away when you close Firefox.

Make a permanent, shareable build. Raise `version` in `manifest.json` first.

```bash
export WEB_EXT_API_KEY='user:...'
export WEB_EXT_API_SECRET='...'
npx --yes web-ext sign --channel=unlisted --ignore-files test.js README.md
```

The signed `.xpi` lands in `web-ext-artifacts/`. Attach it to a GitHub release.

## Use

Two entry points, on purpose:

- **Ctrl+Shift+U** (Mac: **Control+Shift+U**) — opens the **editor** for the
  active tab in a small standalone window, centred on the browser window. It
  saves the tab on open (url, title, meta description), then title, description,
  note and tags are all editable. Enter or **Save** closes it, Esc too, **Forget**
  deletes the entry (also available straight from the menu). Being a real window, it does not vanish when it loses focus.
- **Toolbar icon** — opens the **menu**: a big badge for the current tab's state
  (*not saved* / *saved* / *hoarded*), then **Save current tab** / **Edit saved
  tab** — the same editor, drawn inside the panel itself rather than as a
  window —
  **Export saved tabs**, **Close hoarded tabs**, **Options**, and a count of
  what's ready to export.

Rebind the shortcut in **Options**, or `about:addons` → gear → Manage Extension
Shortcuts. If a combination does nothing, the browser or another add-on already
owns it — the settings page can't detect that, pick another.

- Already-saved pages show a green **✦ hoarded** pill bottom-left, plus a ✓ on the
  toolbar icon.
- **keep tab on export** = pinned, that tab survives **Close hoarded tabs**.
- **Export saved tabs** → `YYYYMMDD-HHmm_hoardr-session.json` in Downloads.
  **Close hoarded tabs** is a permanent menu entry — active whenever an exported,
  non-pinned tab is open, not just right after an export. It asks first: the
  button turns into *Really close N?* and you click it again to confirm.

## Export shape

```json
{ "exportedAt": "…", "items": [
  { "state": "new", "url": "…", "title": "…", "description": "…",
    "note": "…", "tags": ["…"], "savedAt": "…", "updatedAt": "…" } ] }
```

`state` is `new` (first export) or `update` (edited after a previous export).
Clean entries are never re-exported.

The editor exists once, as `editor.html`. The toolbar panel embeds it in an
iframe (auto-sized on load); the shortcut opens it as a standalone window. It
calls `top.close()`, which closes whichever of the two it is living in.

## Storage

One `storage.local` key per entry: `t:<normalized url>`. Lookup by URL is a single
indexed get — no full-blob rewrite on every save, no IndexedDB schema to maintain.
Normalization strips `www.`, the hash, trailing slash and tracking params
(`utm_*`, `fbclid`, …) so the same page saved twice is one entry.

`node test.js` covers normalization and state.

## Badge reliability

The background script is the only component that resolves a tab's URL. It reads
`sender.tab.url`, looks the entry up once, and drives both the toolbar ✓ and the
in-page pill from that one answer — so the two can never disagree. The content
script owns no state; it just draws what it's handed.

Two site behaviours the pill is built to survive:

- **Trusted Types.** YouTube sends `require-trusted-types-for 'script'`, which
  makes any `innerHTML` assignment throw — including into a shadow root. The pill
  is built with `createElement` + `textContent` + inline `style.cssText`, so there
  is no HTML sink and no `<style>` element for a page's `style-src` to reject.
- **Frameworks sweeping the DOM.** The pill hangs off `<html>` (not `<body>`) and
  a `MutationObserver` re-attaches it if a hydrating app removes it.

Still impossible, by design: `about:*`, `view-source:`, the built-in PDF viewer
and `addons.mozilla.org`. No extension may script those, so the toolbar ✓ is the
only marker there.
