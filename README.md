# Tab Hoardr

Hoard tabs → export one JSON → feed it to your Obsidian CLI agent.

## Install (Zen / Firefox)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`.
(Temporary = gone on restart. For permanent: zip the folder and sign it at
addons.mozilla.org, or use Zen/Firefox Developer Edition with
`xpinstall.signatures.required=false`.)

## Use

- **Ctrl+Shift+U** (Mac: **Control+Shift+U**) — saves the active tab instantly
  (url, title, meta description), then the popup opens for an optional note +
  tags. Enter closes it.
  Rebind it from the popup's **shortcut** link, or `about:addons` → gear →
  Manage Extension Shortcuts. If a combination does nothing, the browser or
  another add-on already owns it — the settings page can't detect that, pick another.
- Already-saved pages show a green **✦ hoarded** pill bottom-left, plus a ✓ on the
  toolbar icon. Pressing the shortcut again edits instead of duplicating.
- **keep tab on export** = pinned, that tab survives the post-export cleanup.
- **Export** → `YYYYMMDD-HHmm_hoardr-session.json` in Downloads, then offers to
  close every exported non-pinned tab.

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

The pill is an ordinary content script writing into a closed shadow root — that
is unchanged in MV3 and identical in Chrome. It can still be missing in three
cases, two of which are now handled:

- **tab opened before the extension loaded** (i.e. every tab, every time you
  reload the temporary add-on) — the background script now injects into existing
  http(s) tabs on install and startup.
- **client-side navigation** (pushState / SPA routing / back-forward cache) — the
  background script forwards URL changes so the content script re-checks.
- **pages no extension may touch** — `about:*`, `view-source:`, the built-in PDF
  viewer, `addons.mozilla.org`. No content script runs there and none can. The
  toolbar ✓ is the only marker on those, by design.
