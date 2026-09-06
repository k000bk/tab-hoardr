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

assert.strictEqual(state({ exportedAt: null, updatedAt: 5 }), 'new');
assert.strictEqual(state({ exportedAt: 10, updatedAt: 5 }), 'clean');
assert.strictEqual(state({ exportedAt: 10, updatedAt: 20 }), 'update');

console.log('ok');
