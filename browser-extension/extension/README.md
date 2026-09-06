# Tab Hoardr

Hoard tabs → export one JSON → feed it to your Obsidian CLI agent.

Manifest V3. One folder, every browser: Firefox 127+ (and Zen) and Chrome 121+
(Brave, Arc, Edge).

## Install

**Firefox, Zen.** Signed builds are on the [Releases page](../../../../releases).
Open `about:addons`, click the gear icon, then **Install Add-on From File**.

**Chrome, Brave, Arc, Edge.** Open `chrome://extensions`, turn on **Developer
mode**, click **Load unpacked**, pick this folder. It stays until you remove it.

Neither build auto-updates. The `.xpi` is signed unlisted with no `update_url`,
so Firefox never checks for a new one; Chrome cannot update a folder it was
handed. New version means installing it again.

**Install over the old one — never Remove first.** Both browsers delete
`storage.local` when an add-on is uninstalled, so Remove-then-Install is a
silent, unrecoverable wipe of every saved tab. Installing the new `.xpi` over
the old one is an update (same `gecko.id`) and keeps storage; so does unzipping
over the loaded Chrome folder and hitting its reload arrow. Options → Your data →
**Back up** exists for the times someone does it in the wrong order anyway.

## Develop

Firefox: `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on** ->
pick `manifest.json`. This version goes away when you close Firefox.

Chrome: the same **Load unpacked** as above, then the reload arrow after an edit.

Make a permanent, shareable Firefox build. Raise `version` in `manifest.json` first.

```bash
export WEB_EXT_API_KEY='user:...'
export WEB_EXT_API_SECRET='...'
npx --yes web-ext sign --channel=unlisted --ignore-files test.js README.md
```

The signed `.xpi` lands in `web-ext-artifacts/`. Attach it to a GitHub release.

Chrome has no signing step, and a self-made `.crx` will not install — outside the
Chrome Web Store these browsers only take a folder. Ship a zip of it:

```bash
zip -r ../../tab-hoardr-chrome.zip . -x "test.js" "README.md" "web-ext-artifacts/*" ".*"
```

## Cross-browser notes

**One manifest, two background keys.** It names a `service_worker` (Chrome reads
it) and `scripts` (Firefox reads it). Each browser ignores the other's key and
warns about it. Both warnings are expected and neither breaks anything:

- Chrome, Brave, Arc: *"'background.scripts' requires manifest version of 2 or
  lower"*. Chrome ignores the key and runs `sw.js`. From Chrome 121 only — older
  Chrome refuses the add-on outright, hence `minimum_chrome_version`.
- Firefox (`web-ext lint`): *"service_worker is ignored"*. Firefox runs `scripts`.

Firefox has never supported `service_worker`, so no single manifest is
warning-free. Removing either key breaks that browser. Leave them.

**`compat.js`** aliases `browser` to `chrome` and loads first in every context —
pages, `sw.js`, and the function injected by `scripting.executeScript`.

**Toolbar icons are PNG**, because Chrome does not read SVG there. `icon.svg` is
still the source. After editing it:

```bash
for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o icon-$s.png; done
```

**Chrome cannot set a shortcut from a page.** `options.js` tests for
`commands.update` and falls back to opening `chrome://extensions/shortcuts`.
Firefox keeps the in-page key recorder.

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

Rebind the shortcut in **Options**. In Firefox the field records the keys; in
Chrome it opens `chrome://extensions/shortcuts`, which does the same job. If a combination does nothing, the browser or another add-on already
owns it — the settings page can't detect that, pick another.

- Already-saved pages show a ✓ on the toolbar icon. That is the only marker —
  nothing is drawn into the page.
- **keep tab on export** = pinned, that tab survives **Close hoarded tabs**.
- **Export saved tabs** → `YYYYMMDD-HHmm_hoardr-session.json` in Downloads.
  **Close hoarded tabs** is a permanent menu entry — active whenever an exported,
  non-pinned tab is open, not just right after an export. It asks first: the
  button turns into *Really close N?* and you click it again to confirm.

## Update check

The popup asks GitHub for the latest release tag and compares it with the
manifest version; a newer tag shows an **Update available** pill in the popup
header, linking to the release page. The verdict is cached in
`storage.local.updateCheck` and refreshed at most once a week, so opening the
popup a hundred times a day is still one anonymous request per week — well
inside GitHub's 60/h unauthenticated limit. Nothing but the request itself
leaves the browser; a failure (offline, rate limit) just leaves the pill hidden.
Options → Creator → **Check for updates** forces a fresh check.

## Back up and restore

Options → **Your data**. **Back up** writes every `t:` record verbatim to
`YYYYMMDD-HHmm_hoardr-backup.json` in Downloads; **Restore** reads one back.

```json
{ "tabHoardrBackup": 1, "at": "…", "entries": { "t:https://…": { …record… } } }
```

Not the same file as an export. A backup keeps `exportedAt` and `normUrl`, so a
restored tab returns in the state it left — a hoarded tab is still hoarded and is
not exported again. An export is for Obsidian and drops both.

Restore merges, newest `updatedAt` per tab wins, so running it twice is a no-op
and an old backup never undoes newer work. `restoreRecord()` in `lib.js` rebuilds
each record field by field and re-derives the storage key from the record's own
`url`, so nothing a hand-edited file claims can write outside `t:<normalized url>`.

## Export shape

```json
{ "exportedAt": "…", "items": [
  { "state": "new", "url": "…", "title": "…", "description": "…",
    "note": "…", "tags": ["…"], "savedAt": "…", "updatedAt": "…" } ] }
```

`state` is `new` (first export) or `update` (edited after a previous export).
Clean entries are never re-exported.

The editor exists once, as `editor.html`. The toolbar panel embeds it in an
iframe; the shortcut opens it as a standalone window. Both size themselves to the
form — the iframe in `popup.js`, the window in `fit()` in `editor.js`, which adds
the title bar it measures rather than a guessed constant. It calls `top.close()`,
which closes whichever of the two it is living in.

## Storage

One `storage.local` key per entry: `t:<normalized url>`. Lookup by URL is a single
indexed get — no full-blob rewrite on every save, no IndexedDB schema to maintain.
Normalization strips `www.`, the hash, trailing slash and tracking params
(`utm_*`, `fbclid`, …) so the same page saved twice is one entry.

`node test.js` covers normalization, entry state and the version compare.

## The badge is the only marker

There is no content script. Earlier versions drew a **✦ hoarded** pill into the
page; it was removed, because whether it appeared at all depended on the site.
`about:*`, `chrome://*`, `view-source:`, the PDF viewer, `addons.mozilla.org` and
the Chrome Web Store refuse injection outright, Trusted Types and `style-src`
policies fight the element, hydrating frameworks sweep it out of the DOM, and a
page's own fixed-position furniture sits on top of it. A marker that is missing
on exactly the pages you hoard most is worse than no marker: you learn not to
trust it. The toolbar ✓ is browser chrome, so it is always right.

`paint()` is now three lines and cannot fail on any page. The per-tab badge is
the browser's state, not the add-on's — it is blank again after a restart and
after an update — so `repaintAll()` runs on `onStartup` and `onInstalled` and
walks every open tab. `onUpdated`, `onActivated` and `storage.onChanged` keep it
current after that.

The page title and description are still read from the page, but only for the one
tab being saved and only at that moment: `editor.js` injects a function with
`scripting.executeScript`. On a page that refuses injection the call is caught and
`tab.title` carries the name instead. That is the whole reason `scripting` and the
host permissions are in the manifest.
