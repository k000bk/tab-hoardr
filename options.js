const NAME = 'save-tab';
const rec = document.getElementById('rec');
const msg = document.getElementById('msg');

const say = (text, cls = '') => { msg.textContent = text; msg.className = cls; };

const show = async () => {
  const cmd = (await browser.commands.getAll()).find(c => c.name === NAME);
  rec.value = cmd?.shortcut || 'not set';
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

rec.addEventListener('focus', () => say('Listening… press the combination.'));
rec.addEventListener('blur', () => { show(); say('Click the field, then press the combination.'); });

rec.addEventListener('keydown', async e => {
  e.preventDefault();
  if (['Escape', 'Tab'].includes(e.key)) return rec.blur();
  const shortcut = toShortcut(e);
  if (!shortcut) return say('Needs Ctrl, Alt or Cmd plus a letter, digit or arrow.', 'err');
  try {
    await browser.commands.update({ name: NAME, shortcut });
    rec.value = shortcut;
    say(`Saved — ${shortcut}`, 'ok');
  } catch (err) {
    say(String(err.message || err), 'err');
  }
});

document.getElementById('reset').addEventListener('click', async () => {
  await browser.commands.reset(NAME);
  await show();
  say(`Reset — ${rec.value}`, 'ok');
});
