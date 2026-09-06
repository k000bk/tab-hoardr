const assert = require('assert');
const { normalize, state, isNewer, restoreRecord, newEntry, content } = require('./lib.js');

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

console.log('ok');

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
