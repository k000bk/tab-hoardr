const assert = require('assert');
const { normalize, state, isNewer, restoreRecord, newEntry, content, savedTabView, bulkTabs, restoreSettings } = require('./lib.js');

const same = (a, b) => assert.strictEqual(normalize(a), normalize(b), `${a} !== ${b}`);

same('https://www.Example.com/a/', 'https://example.com/a');
same('https://example.com/a#frag', 'https://example.com/a');
same('https://example.com/a?utm_source=x&id=7', 'https://example.com/a?id=7');
same('https://example.com/a?fbclid=z', 'https://example.com/a');
assert.notStrictEqual(normalize('https://example.com/a'), normalize('https://example.com/b'));
assert.strictEqual(normalize('https://example.com/'), 'https://example.com/');
assert.strictEqual(normalize('https://example.com:8080/x'), 'https://example.com:8080/x');
assert.strictEqual(normalize('not a url'), 'not a url');

// `s` is a real query param (WordPress search), not tracking — must survive.
assert.strictEqual(normalize('https://blog.com/?s=rust'), 'https://blog.com/?s=rust');
assert.notStrictEqual(normalize('https://blog.com/?s=rust'), normalize('https://blog.com/?s=go'));
// Param order is not identity.
same('https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2');
// Anchors collapse, hash routes do not.
same('https://example.com/post#intro', 'https://example.com/post#outro');
assert.notStrictEqual(normalize('https://app.com/#/inbox'), normalize('https://app.com/#/sent'));
assert.strictEqual(normalize('https://app.com/#/inbox'), 'https://app.com/#/inbox');

assert.strictEqual(state({ exportedAt: null, updatedAt: 5 }), 'new');
assert.strictEqual(state({ exportedAt: 10, updatedAt: 5 }), 'clean');
assert.strictEqual(state({ exportedAt: 10, updatedAt: 20 }), 'update');

assert.ok(isNewer('0.3.0', '0.2.0'));
assert.ok(isNewer('0.2.10', '0.2.9'));   // not a string compare
assert.ok(isNewer('1.0', '0.9.9'));      // missing parts are 0
assert.ok(!isNewer('0.2.0', '0.2.0'));
assert.ok(!isNewer('0.1.9', '0.2.0'));

// Restore takes a file the user picked. Junk in, nothing or a clean record out.
assert.strictEqual(restoreRecord(null), null);
assert.strictEqual(restoreRecord({}), null);
assert.strictEqual(restoreRecord({ url: 'javascript:alert(1)' }), null);
assert.strictEqual(restoreRecord({ url: 'file:///etc/passwd' }), null);

const r = restoreRecord({
  url: 'https://www.Example.com/a/?utm_source=x',
  title: 'T', description: 'D', note: 'N', tags: ['a', 2], pinned: 1,
  savedAt: 100, updatedAt: 200, exportedAt: 150,
  evil: 'dropped'
});
assert.strictEqual(r.normUrl, 'https://example.com/a');   // key comes from the url, not the file
assert.deepStrictEqual(r.tags, ['a', '2']);
assert.strictEqual(r.pinned, true);
assert.strictEqual(r.exportedAt, 150);
assert.ok(!('evil' in r));
assert.strictEqual(state(r), 'update');                   // 200 > 150

// A never-exported entry survives the round trip as never-exported.
assert.strictEqual(restoreRecord({ url: 'https://a.com', exportedAt: null }).exportedAt, null);

// A bulk-saved record must look exactly like an editor-saved one: unexported,
// with the page's own title where the injection worked and the tab's when it did not.
const bulk = newEntry({ url: 'https://www.Example.com/a/?utm_source=x', title: 'Tab title' }, null);
assert.strictEqual(bulk.normUrl, 'https://example.com/a');
assert.strictEqual(bulk.title, 'Tab title');
assert.strictEqual(bulk.exportedAt, null);
assert.strictEqual(state(bulk), 'new');
assert.strictEqual(newEntry({ url: 'https://e.com', title: 'Tab' }, { title: 'Page' }).title, 'Page');

// `pinned` is not exported, so it must not count as an edit — unticking "keep
// tab on export" on an exported tab used to push it into the next export.
const hoarded = { title: 'T', description: 'D', note: 'N', tags: ['a'], pinned: true, updatedAt: 5, exportedAt: 10 };
assert.strictEqual(state(hoarded), 'clean');
assert.strictEqual(content({ ...hoarded, pinned: false }), content(hoarded));
assert.notStrictEqual(content({ ...hoarded, note: 'N2' }), content(hoarded));
assert.notStrictEqual(content({ ...hoarded, tags: ['a', 'b'] }), content(hoarded));

// The library searches all exported content fields, regardless of case, and an
// empty or space-only query keeps the complete collection.
const saved = [
  { normUrl: 'https://c.test', title: 'Alpha TITLE', description: '', note: '', tags: [], savedAt: 30, updatedAt: 10 },
  { normUrl: 'https://a.test', title: 'One', description: 'Useful Description', note: '', tags: [], savedAt: 10, updatedAt: 30 },
  { normUrl: 'https://b.test', title: 'Two', description: '', note: 'Private NOTE', tags: ['Design', 'UX'], savedAt: 20, updatedAt: 20 }
];
assert.deepStrictEqual(savedTabView(saved, 'alpha').items.map(e => e.normUrl), ['https://c.test']);
assert.deepStrictEqual(savedTabView(saved, 'DESCRIPTION').items.map(e => e.normUrl), ['https://a.test']);
assert.deepStrictEqual(savedTabView(saved, ' note ').items.map(e => e.normUrl), ['https://b.test']);
assert.deepStrictEqual(savedTabView(saved, 'design').items.map(e => e.normUrl), ['https://b.test']);
assert.strictEqual(savedTabView(saved, '   ').total, 3);
assert.strictEqual(savedTabView(saved, 'missing').total, 0);
assert.deepStrictEqual(savedTabView([], '').items, []);

// Both date fields and directions have a known order. URLs give equal dates a
// stable secondary order.
assert.deepStrictEqual(savedTabView(saved, '', 'savedAt', 'newest').items.map(e => e.normUrl),
  ['https://c.test', 'https://b.test', 'https://a.test']);
assert.deepStrictEqual(savedTabView(saved, '', 'savedAt', 'oldest').items.map(e => e.normUrl),
  ['https://a.test', 'https://b.test', 'https://c.test']);
assert.deepStrictEqual(savedTabView(saved, '', 'updatedAt', 'newest').items.map(e => e.normUrl),
  ['https://a.test', 'https://b.test', 'https://c.test']);
assert.deepStrictEqual(savedTabView(saved, '', 'updatedAt', 'oldest').items.map(e => e.normUrl),
  ['https://c.test', 'https://b.test', 'https://a.test']);
const tied = saved.map(e => ({ ...e, savedAt: 1 }));
assert.deepStrictEqual(savedTabView(tied).items.map(e => e.normUrl),
  ['https://a.test', 'https://b.test', 'https://c.test']);

// Only the requested batch reaches the page, while totals still cover every
// matching item in the complete in-memory collection.
const many = Array.from({ length: 121 }, (_, i) => ({
  normUrl: `https://example.test/${String(i).padStart(3, '0')}`,
  title: i < 115 ? 'match' : 'other', savedAt: i, updatedAt: i
}));
const first = savedTabView(many, 'match');
assert.strictEqual(first.items.length, 50);
assert.strictEqual(first.total, 115);
assert.strictEqual(first.remaining, 65);
const second = savedTabView(many, 'match', 'savedAt', 'newest', 100);
assert.strictEqual(second.items.length, 100);
assert.strictEqual(second.remaining, 15);
const last = savedTabView(many, 'match', 'savedAt', 'newest', 150);
assert.strictEqual(last.items.length, 115);
assert.strictEqual(last.remaining, 0);

console.log('ok');

// Bulk save: pinned tabs are skipped by default, excluded pages by exact match.
const open = [
  { url: 'https://app.slack.com/client/T1/C1' },
  { url: 'https://www.reddit.com/?utm_source=x' },
  { url: 'https://reddit.com/r/rust/comments/1' },
  { url: 'https://mail.example.com/', pinned: true },
  { url: 'about:addons' }
];
const kept = s => bulkTabs(open, s).map(t => t.url);
assert.deepStrictEqual(kept(undefined), [open[0].url, open[1].url, open[2].url]);
assert.deepStrictEqual(kept({ skipPinned: false }), [open[0].url, open[1].url, open[2].url, open[3].url]);
// `reddit.com` is the front page only — the post survives. Scheme, www and
// tracking params do not break the match.
assert.deepStrictEqual(kept({ exclude: ['reddit.com', 'https://app.slack.com/client/T1/C1'] }), [open[2].url]);
assert.deepStrictEqual(kept({ exclude: ['http://reddit.com/'] }), [open[0].url, open[2].url]);
// A different Slack channel is a different page.
assert.deepStrictEqual(kept({ exclude: ['app.slack.com/client/T1/C2'] }), [open[0].url, open[1].url, open[2].url]);

// Settings from a backup file: junk in, nothing or two clean fields out.
assert.strictEqual(restoreSettings(undefined), null);
assert.strictEqual(restoreSettings('x'), null);
assert.deepStrictEqual(restoreSettings({ skipPinned: 0, exclude: [' reddit.com ', '', 42], evil: 1 }),
  { skipPinned: false, exclude: ['reddit.com', '42'] });
assert.deepStrictEqual(restoreSettings({}), { skipPinned: true, exclude: [] });
