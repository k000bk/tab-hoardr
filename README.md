# Tab Hoardr

Hoard tabs in the browser. Export one JSON. Feed it to Obsidian.

## What is in here

| Folder | What it holds |
|---|---|
| [browser-extension/firefox](browser-extension/firefox) | The Firefox add-on. Manifest V2. This is the working part. |
| [browser-extension/ui-storybook](browser-extension/ui-storybook) | One HTML page. It shows every UI part and colour. Open it in a browser. |
| [obsidian](obsidian) | The Obsidian side. It reads the exported JSON. |

Chrome is not done yet. It needs a Manifest V3 port. It will live in
`browser-extension/chrome/`.

## Install the add-on

Download the signed `.xpi` from the
[Releases page](../../releases). In Firefox open `about:addons`, click the gear
icon, then **Install Add-on From File**.

To build and use the code yourself, read
[browser-extension/firefox/README.md](browser-extension/firefox/README.md).
