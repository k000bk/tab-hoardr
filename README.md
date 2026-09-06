# Tab Hoardr

Hoarding too much tabs? Save in a better way than classical bookmark approach.
Export one JSON. Feed it to Obsidian with LLM. Or just to an LLM.

Works in Firefox, Zen, Chrome, Brave, Arc and Edge. One add-on, one set of files.

## What is in here

| Folder | What it holds |
|---|---|
| [browser-extension/extension](browser-extension/extension) | The add-on. Manifest V3. It works in Firefox, Chrome, Brave, Arc, Edge and Zen. This is the working part. |
| [browser-extension/ui-storybook](browser-extension/ui-storybook) | One HTML page. It shows every UI part and colour. Open it in a browser. |
| [obsidian](obsidian) | The Obsidian side. To be updated. |

One folder holds one add-on. The same files load in Firefox and in the Chrome-type
browsers, so there is no second copy to keep in step.

## Install the add-on

**Firefox and Zen.** Download the signed `.xpi` from the
[Releases page](../../releases). Open `about:addons`, click the gear icon, then
**Install Add-on From File**. You need Firefox 127 or later.

**Chrome, Brave, Arc and Edge.** Download the `.zip` from the same
[Releases page](../../releases) and unzip it. Open `chrome://extensions`, turn on
**Developer mode**, click **Load unpacked**, and pick the unzipped folder. You
need Chrome 121 or later.

These browsers only accept a signed add-on from the Chrome Web Store, so this one
is loaded by hand, and the browser shows a developer-mode notice when it starts.

**Neither build updates itself.** A new version means downloading the new file
and installing it again — the `.xpi` over the old one in Firefox, or a fresh
**Load unpacked** in Chrome. Watch the [Releases page](../../releases) to know
when there is one.

To build and use the code yourself, read [browser-extension/extension/README.md](browser-extension/extension/README.md).

## Roadmap
- [ ] Add ability to search, browse and manage hoarded tabs (bookmarks) 
- [ ] Add Obsidian workflow info
- [x] Manifest V3 compatibility
- [x] Firefox and ZEN compatible extension that exports .json
- [x] Chrome, Brave and Arc compatible

## Privacy first
Your tabs stay on your computer. Nothing is sent anywhere.

- The add-on saves each tab in the browser's own add-on storage, on your disk. One saved tab is one small record.
- A record holds only what you see in the editor: the address, the title, the description, your note, your tags, and the save and export dates.
- There is no account, no sync, no server. The code makes no network calls at all.
- Export writes one JSON file to your Downloads folder. You choose what happens to it next.
- **Forget** deletes the record. Removing the add-on deletes all of them.
- The add-on asks for one permission that sounds large: read the address of your
  tabs. It needs it to know which page you are on and whether it is already
  saved. Nothing leaves your disk.

Want to check for yourself? In Firefox open `about:debugging#/runtime/this-firefox`
(in Chrome, `chrome://extensions` and click **service worker**), click **Inspect**
next to Tab Hoardr, and run this in the Console:

```js
await browser.storage.local.get(null)
```

That prints every tab the add-on is holding. If it prints `{}`, it is holding nothing.
