# Tab Hoardr

Hoarding too much tabs? Save in a better way than classical bookmark approach.
Export one JSON. Feed it to Obsidian with LLM. Or just to an LLM.

## What is in here

| Folder | What it holds |
|---|---|
| [browser-extension/firefox](browser-extension/firefox) | The Firefox add-on. Manifest V2. This is the working part. |
| [browser-extension/ui-storybook](browser-extension/ui-storybook) | One HTML page. It shows every UI part and colour. Open it in a browser. |
| [obsidian](obsidian) | The Obsidian side. To be updated. |

Chrome is not done yet. It needs a Manifest V3 port. It will live in `browser-extension/chrome/`.

## Install the add-on

Download the signed `.xpi` from the [Releases page](../../releases).
In Firefox open `about:addons`, click the gear icon, then **Install Add-on From File**.

To build and use the code yourself, read [browser-extension/firefox/README.md](browser-extension/firefox/README.md).

## Roadmap
- [ ] Add ability to search, browse and manage hoarded tabs (bookmarks) 
- [ ] Add Obsidian workflow info
- [ ] Manifest V3 compatibility
- [x] Firefox and ZEN compatible extension that exports .json

## Privacy first
Your tabs stay on your computer. Nothing is sent anywhere.

- The add-on saves each tab in Firefox's own add-on storage, on your disk. One saved tab is one small record.
- A record holds only what you see in the editor: the address, the title, the description, your note, your tags, and the save and export dates.
- There is no account, no sync, no server. The code makes no network calls at all.
- Export writes one JSON file to your Downloads folder. You choose what happens to it next.
- **Forget** deletes the record. Removing the add-on deletes all of them.

Want to check for yourself? In Firefox open `about:debugging#/runtime/this-firefox`, click **Inspect** next to Tab Hoardr, and run this in the Console:

```js
await browser.storage.local.get(null)
```

That prints every tab the add-on is holding. If it prints `{}`, it is holding nothing.
