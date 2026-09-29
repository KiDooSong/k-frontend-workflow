import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeJson, scopeSet, scopeLf } from './scoped-work-normalize.mjs';

// Serialization witnesses only. No scope/approval/permit is manufactured here.
test('D normalization: object keys follow UTF-8 bytes, including integer-like and non-BMP keys', () => {
  const value = { '2': 'two', '10': 'ten', z: { '\u{1f600}': 2, '\ue000': 1 }, a: true };
  assert.equal(scopeJson(value), '{"10":"ten","2":"two","a":true,"z":{"\ue000":1,"\u{1f600}":2}}');
  assert.equal(scopeJson({ z: value.z, a: true, '10': 'ten', '2': 'two' }), scopeJson(value));
});

test('D normalization: compact JSON preserves strings and ordered cells/body, not a generic array sort', () => {
  const value = { cells: ['Question', 'Status'], body: 'line 1\n\tline 2  ', n: 2.5, empty: null };
  assert.equal(scopeJson(value), '{"body":"line 1\\n\\tline 2  ","cells":["Question","Status"],"empty":null,"n":2.5}');
  assert.notEqual(scopeJson(['A', 'B']), scopeJson(['B', 'A']));
  assert.notEqual(scopeJson(['A', 'A']), scopeJson(['A']));
  assert.equal(scopeJson(-0), '0');
});

test('D normalization: set members sort by normalized JSON bytes and leave nested ordered arrays intact', () => {
  const a = { path: '/b', method: 'GET', cells: ['B', 'A'] };
  const b = { method: 'GET', path: '/a', cells: ['A', 'B'] };
  assert.equal(scopeJson(scopeSet([a, b])), scopeJson(scopeSet([b, a])));
  assert.deepEqual(scopeSet([2, 10, 'z', 'a']), ['a', 'z', 10, 2]);
  assert.deepEqual(scopeSet([a])[0].cells, ['B', 'A']);
});

test('D normalization: duplicate normalized members are rejected, not removed', () => {
  for (const values of [[1, 1], ['same', 'same'], [{ a: 1, b: 2 }, { b: 2, a: 1 }], [-0, 0]]) {
    assert.throws(() => scopeSet(values, 'known_units'), /known_units: duplicate normalized member/);
  }
  assert.deepEqual(scopeSet([]), []);
  for (const value of [null, undefined, {}, '[]']) assert.throws(() => scopeSet(value), /array required/);
});

test('D normalization: optional defaults, endpoint case and semantic selector normalization belong to schemas', () => {
  assert.notEqual(scopeJson({}), scopeJson({ isolation: null }));
  assert.notEqual(scopeJson({ sources: [] }), scopeJson({ sources: null }));
  assert.notEqual(scopeJson({ method: 'get' }), scopeJson({ method: 'GET' }));
  assert.notEqual(scopeJson('src/Panel.tsx'), scopeJson('src/panel.tsx'));
  // No pathname repair and no Unicode normalization of authored identifiers.
  assert.notEqual(scopeJson('src/x/../Panel.tsx'), scopeJson('src/Panel.tsx'));
  assert.notEqual(scopeJson('\u00e9'), scopeJson('e\u0301'));
});

test('D normalization: prototypes with names used as ordinary keys do not affect encoding', () => {
  const value = JSON.parse('{"__proto__":{"x":1},"constructor":"value","toString":"text"}');
  assert.equal(scopeJson(value), '{"__proto__":{"x":1},"constructor":"value","toString":"text"}');
  const plain = Object.create(null);
  plain.constructor = 'own';
  assert.equal(scopeJson(plain), '{"constructor":"own"}');
  const restored = scopeSet([value])[0];
  assert.equal(Object.hasOwn(restored, '__proto__'), true);
  assert.equal({}.x, undefined);
});

test('D normalization: source objects and selector arrays are not mutated or returned by alias', () => {
  const value = [{ z: ['B', 'A'], a: 1 }, { a: 2 }];
  const before = structuredClone(value);
  const result = scopeSet(value);
  result[0].a = 99;
  result.find((entry) => entry.z).z.push('changed');
  assert.deepEqual(value, before);
  scopeJson(Object.freeze({ b: Object.freeze(['B', 'A']), a: 1 }));
});

test('D normalization: undefined, non-finite and other non-JSON values fail instead of disappearing', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol('x'), () => 1,
    { a: undefined }, [undefined], new Date(0), new Map(), new Set(), Buffer.from('x')]) {
    assert.throws(() => scopeJson(value), /SW-NORMALIZE/);
  }
});

test('D normalization: cycles fail but shared acyclic values are expanded', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const array = []; array.push(array);
  assert.throws(() => scopeJson(cyclic), /cyclic object/);
  assert.throws(() => scopeJson(array), /cyclic object/);
  const shared = { x: 1 };
  assert.equal(scopeJson([shared, shared]), '[{"x":1},{"x":1}]');
});

test('D normalization: sparse arrays, accessors and hidden data cannot silently drop evidence', () => {
  let calls = 0;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { calls += 1; return 1; } });
  const toJSON = { toJSON() { calls += 1; return 'changed'; } };
  const extra = []; extra.note = 'hidden by ordinary JSON';
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const symbol = { [Symbol('hidden')]: 1 };
  const accessorArray = Object.defineProperty([], '0', { enumerable: true, get() { calls += 1; return 1; } });
  for (const value of [Array(1), [, 1], extra, getter, hidden, symbol, accessorArray, toJSON]) {
    assert.throws(() => scopeJson(value), /SW-NORMALIZE/);
  }
  assert.throws(() => scopeSet(accessorArray), /SW-NORMALIZE/);
  assert.equal(calls, 0);
});

test('D normalization: lone surrogates cannot collapse UTF-8 key or text identities', () => {
  for (const value of ['\ud800', '\udc00', 'x\ud800a', { '\ud800': 1 }, { text: '\udfff' }]) {
    assert.throws(() => scopeJson(value), /unpaired Unicode surrogate/);
  }
  assert.equal(scopeJson('\u{1f600}'), '"\u{1f600}"');
});

test('D normalization: selected content only normalizes line endings, never trims meaningful whitespace', () => {
  assert.equal(scopeLf(' a\r\nb\rc\n '), ' a\nb\nc\n ');
  assert.equal(scopeJson(scopeLf('x\r\ny')), scopeJson(scopeLf('x\ny')));
  assert.notEqual(scopeJson(scopeLf('x\ny ')), scopeJson(scopeLf('x\ny')));
  assert.throws(() => scopeLf(null), /selected content must be text/);
  assert.throws(() => scopeLf('\ud800'), /unpaired Unicode surrogate/);
});
