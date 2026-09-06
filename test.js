const assert = require('assert');
const { normalize, state } = require('./lib.js');

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

console.log('ok');
