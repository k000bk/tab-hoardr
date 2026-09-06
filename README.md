# Tab Hoardr

Hoard tabs → export one JSON → feed it to your Obsidian CLI agent.

## Install (Zen / Firefox)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`.
(Temporary = gone on restart. For permanent: zip the folder and sign it at
addons.mozilla.org, or use Zen/Firefox Developer Edition with
`xpinstall.signatures.required=false`.)

## Use

- Click the toolbar icon (or **Ctrl+Shift+U**, Mac: **Control+Shift+U**) to open
  the menu: a big badge for the current tab's state — *not saved* / *saved* /
  *hoarded* — then **Save current tab**, **Export saved tabs**, **Close hoarded
  tabs**, **Options**, and a count of what's ready to export. Nothing is saved
  until you press Save.
- **Save current tab** grabs url, title and meta description, then opens the
  editor: title, description, note, tags — all editable. Enter closes it,
  **← menu** goes back.
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
