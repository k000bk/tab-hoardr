const NAME = 'save-tab';
const rec = document.getElementById('rec');
const msg = document.getElementById('msg');

const say = (text, cls = '') => { msg.textContent = text; msg.className = cls; };
const displayShortcut = shortcut => {
  if (!navigator.platform.startsWith('Mac')) return shortcut;
  const symbols = { MacCtrl: '⌃', Command: '⌘', Alt: '⌥', Shift: '⇧' };
  return shortcut.split('+').map(part => symbols[part] || part).join(' ');
};

const show = async () => {
  const cmd = (await browser.commands.getAll()).find(c => c.name === NAME);
  rec.value = cmd?.shortcut ? displayShortcut(cmd.shortcut) : 'Not set';
};
show();

// KeyboardEvent.code, not .key — Option+H on macOS reports a composed glyph in .key.
const NAMED = {
  Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Insert: 'Insert', Delete: 'Delete', Period: 'Period', Comma: 'Comma'
};

function toShortcut(e) {
  const mac = navigator.platform.startsWith('Mac');
  const mods = [];
  if (e.ctrlKey) mods.push(mac ? 'MacCtrl' : 'Ctrl');
  if (e.metaKey) mods.push('Command');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const c = e.code;
  const key =
    /^Key[A-Z]$/.test(c) ? c.slice(3)
    : /^Digit\d$/.test(c) ? c.slice(5)
    : /^F\d{1,2}$/.test(c) ? c
    : NAMED[c];
  if (!key) return null;
  // Function keys stand alone; everything else needs a non-Shift modifier.
  if (!/^F\d{1,2}$/.test(key) && !mods.some(m => m !== 'Shift')) return null;
  return [...mods, key].join('+');
}

// Chrome and its cousins have no commands.update/reset — shortcuts live on a
// browser page that no extension may script, only open. Firefox keeps the
// in-page recorder.
if (!browser.commands.update) {
  document.getElementById('reset').hidden = true;
  document.querySelector('.setting-description').textContent =
    'This browser sets extension shortcuts on its own page.';
  rec.addEventListener('click', () => browser.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  say('This browser manages shortcuts itself. Click the field to open its shortcuts page.');
} else {
  rec.addEventListener('focus', () => {
    rec.classList.add('listening');
    rec.value = 'Listening…';
    say('Press the new key combination. Escape cancels.', 'listening');
  });
  rec.addEventListener('blur', () => {
    rec.classList.remove('listening');
    show();
    say('Needs Control, Alt or Command, or a function key.');
  });

  rec.addEventListener('keydown', async e => {
    e.preventDefault();
    if (['Escape', 'Tab'].includes(e.key)) return rec.blur();
    const shortcut = toShortcut(e);
    if (!shortcut) return say('Needs Ctrl, Alt or Cmd plus a letter, digit or arrow.', 'err');
    try {
      await browser.commands.update({ name: NAME, shortcut });
      rec.value = displayShortcut(shortcut);
      rec.classList.remove('listening');
      say(`Saved — ${shortcut}`, 'ok');
    } catch (err) {
      say(String(err.message || err), 'err');
    }
  });

  document.getElementById('reset').addEventListener('click', async () => {
    try {
      await browser.commands.reset(NAME);
      await show();
      say(`Reset — ${rec.value}`, 'ok');
    } catch (err) {
      say(String(err.message || err), 'err');
    }
  });
}

// --- Update check -----------------------------------------------------------
const version = browser.runtime.getManifest().version;
const upd = document.getElementById('upd');
const check = document.getElementById('check');
document.getElementById('ver').textContent = version;

const tell = (text, cls = '') => { upd.textContent = text; upd.className = cls; };

check.addEventListener('click', async () => {
  check.disabled = true;
  tell('Checking GitHub…');
  try {
    const { latest, newer } = await checkUpdate(true);
    if (!newer) return tell(`Up to date — ${version} is the latest release.`, 'ok');
    tell(`Version ${latest} is available — `, 'ok');
    const a = document.createElement('a');
    a.href = RELEASES_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'open the release page';
    upd.append(a);
  } catch (err) {
    tell(err.message || String(err), 'err');
  } finally {
    check.disabled = false;
  }
});

// --- Back up and restore ----------------------------------------------------
// Uninstalling the add-on deletes storage.local with it. A hand-installed update
// done in the wrong order — Remove, then Install — therefore loses every saved
// tab, and no undo exists inside the browser. This is the way back.
// Records are copied whole, exportedAt included, so a restored tab is not
// re-exported and is not wrongly reported as new.
const data = document.getElementById('data');
const restoreFile = document.getElementById('restoreFile');
const report = (text, cls = '') => { data.textContent = text; data.className = cls; };
const plural = n => (n === 1 ? '' : 's');

document.getElementById('backup').addEventListener('click', async () => {
  const store = await browser.storage.local.get(null);
  const entries = Object.fromEntries(Object.entries(store).filter(([k]) => k.startsWith('t:')));
  const n = Object.keys(entries).length;
  if (!n) return report('There is nothing to back up yet.', 'err');

  const s = new Date(), p = v => String(v).padStart(2, '0');
  const name =
    `${s.getFullYear()}${p(s.getMonth() + 1)}${p(s.getDate())}` +
    `-${p(s.getHours())}${p(s.getMinutes())}_hoardr-backup.json`;
  const url = URL.createObjectURL(new Blob(
    [JSON.stringify({ tabHoardrBackup: 1, at: s.toISOString(), entries }, null, 2)],
    { type: 'application/json' }
  ));
  report('Backing up…');
  try {
    const id = await browser.downloads.download({ url, filename: name, saveAs: false });
    if (!(await settled(id))) throw new Error('The browser did not finish the download.');
    report(`Backed up ${n} saved tab${plural(n)} to ${name}`, 'ok');
  } catch (err) {
    report(err.message || String(err), 'err');
  } finally {
    URL.revokeObjectURL(url);
  }
});

document.getElementById('restore').addEventListener('click', () => restoreFile.click());

restoreFile.addEventListener('change', async () => {
  const file = restoreFile.files[0];
  restoreFile.value = ''; // so picking the same file twice fires again
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return report('That file is not readable JSON.', 'err');
  }
  const found = Object.values(parsed?.entries || {}).map(restoreRecord).filter(Boolean);
  if (!found.length) return report('No saved tabs found in that file.', 'err');

  // Newest wins, per tab. Restoring an old backup never undoes newer work.
  const store = await browser.storage.local.get(null);
  const write = {};
  let added = 0, refreshed = 0, kept = 0;
  for (const rec of found) {
    const key = KEY(rec.normUrl);
    const mine = store[key];
    if (!mine) { write[key] = rec; added++; }
    else if (rec.updatedAt > (mine.updatedAt || 0)) { write[key] = rec; refreshed++; }
    else kept++;
  }
  if (Object.keys(write).length) await browser.storage.local.set(write);
  report(`Restored — ${added} added, ${refreshed} updated, ${kept} left alone.`, 'ok');
});
