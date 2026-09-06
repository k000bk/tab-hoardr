---
name: release
description: Ship a new version of the Tab Hoardr add-on — bump the version, test, build the Firefox .xpi and the Chrome .zip, push, and publish a GitHub release. Use when the user says "release", "new release", "new version", "publish the add-on", "ship it", or asks what to do after finishing a feature.
---

# Release Tab Hoardr

One add-on, `browser-extension/extension/`, Manifest V3, two files per release:
a signed `.xpi` for Firefox and a plain `.zip` for Chrome-type browsers.

Report to the owner in ASD-STE100 Simplified Technical English. Short sentences,
plain words, one idea per sentence.

## Never do these

- **Never read, print or echo the AMO API key or secret.** They live in
  `PRIVATE.md`, which is gitignored. The owner runs the signing command
  themselves, in their own terminal. You do not sign.
- **Never commit the `.xpi` or the `.zip`.** Both are in `.gitignore`. They go on
  the Releases page only.
- **Never publish the GitHub release yourself.** Hand the owner the exact steps.

## Step 0 — is a release needed?

```bash
git status --short && git diff --stat HEAD
```

If nothing under `browser-extension/extension/` changed — only `README.md`,
`AGENTS.md` or notes — then **no release is needed**. Say so, offer to commit and
push, and stop. Do not bump the version for a docs change.

## Step 1 — raise the version

Read `"version"` in `browser-extension/extension/manifest.json`. Raise the last
number by one unless the owner asks for something else: `0.2.0` becomes `0.2.1`.
Mozilla refuses a number it already used, so this is not optional.

Check the new number is not already a git tag:

```bash
git tag --list
```

## Step 2 — check it

```bash
cd browser-extension/extension && node test.js && npx --yes web-ext lint --self-hosted
```

- `node test.js` prints nothing when it passes.
- The lint must say **0 errors**. It says **3 warnings**. Those 3 are correct and
  expected — each browser complains about the manifest key the other one uses.
  The extension README explains them under "Cross-browser notes".
- An error means stop. Fix it first. Do not continue.

## Step 3 — make the Chrome file

From inside `browser-extension/extension`:

```bash
zip -r ../../tab-hoardr-chrome.zip . -x "test.js" "README.md" "web-ext-artifacts/*" ".*"
```

Then check what went in:

```bash
unzip -l ../../tab-hoardr-chrome.zip
```

It must hold `manifest.json`, `sw.js`, `compat.js`, the four `icon-*.png` files
and the rest of the source. It must **not** hold `test.js`, `README.md` or
`web-ext-artifacts/`.

## Step 4 — the owner signs the Firefox file

You cannot do this step. The signing needs the owner's secret codes, and a shell
variable does not survive from one command to the next anyway.

Give the owner this, with the codes taken from their own `PRIVATE.md`:

> Paste your two `export` lines from PRIVATE.md into a terminal, then run:
>
> ```bash
> cd browser-extension/extension && npx --yes web-ext sign --channel=unlisted --ignore-files test.js README.md
> ```
>
> It takes a few minutes. Tell me when it is done.

When they say it is done, confirm the file arrived and has the right version:

```bash
ls -l browser-extension/extension/web-ext-artifacts/
```

## Step 5 — push the code

```bash
git add -A && git commit -m "SAY WHAT CHANGED" && git push
```

Write a real message. Say what the version does that the last one did not.

## Step 6 — hand over the release page

Give the owner these steps with the real version number filled in:

> Go to https://github.com/k000bk/tab-hoardr -> **Releases** -> **Draft a new
> release**.
>
> 1. **Choose a tag** -> type `vX.Y.Z` -> **Create new tag on publish**.
> 2. **Title**: `vX.Y.Z`
> 3. Drag in both files:
>    - `browser-extension/extension/web-ext-artifacts/<name>.xpi`
>    - `tab-hoardr-chrome.zip`
> 4. **Description** — paste this, then replace the last line:
>
> ```
> Firefox, Zen — download the .xpi, then about:addons -> gear -> Install Add-on From File.
> Chrome, Brave, Arc, Edge — download the .zip, unzip it, then chrome://extensions -> Developer mode -> Load unpacked -> pick the folder.
>
> What changed: ...
> ```
>
> 5. **Publish release**.

## Step 7 — remind them

Neither build updates itself. The `.xpi` is signed unlisted with no `update_url`,
so Firefox never looks for a new one. A folder loaded unpacked in Chrome has no
update channel at all. Every person must fetch the new file by hand. That is why
"What changed" in the description matters.

Last check: download both files from the published page and install them. If they
work from that page, they work for other people.
