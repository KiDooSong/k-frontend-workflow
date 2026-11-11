import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  for (const value of ['\ud800', '\udc00', 'x\ud800a', '\ud800\ud800', '\udc00\ud800',
    '\u{10000}\ud800', { '\ud800': 1 }, { text: '\udfff' }]) {
    const error = { name: 'TypeError', message: 'SW-NORMALIZE: unpaired Unicode surrogate' };
    assert.throws(() => scopeJson(value), error);
    assert.throws(() => scopeSet([value]), error);
    if (typeof value === 'string') assert.throws(() => scopeLf(value), error);
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

test('#300 normalization: a later invalid member is not hidden by an earlier duplicate', () => {
  for (const [invalid, message] of [[NaN, 'non-finite number'], [undefined, 'non-JSON value'],
    [{ text: '\ud800' }, 'unpaired Unicode surrogate']]) {
    assert.throws(() => scopeSet([1, 1, invalid], 'known_units'), {
      name: 'TypeError', message: `SW-NORMALIZE: ${message}`,
    });
  }
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => scopeSet(['same', 'same', cycle]), /cyclic object/);
});

test('#300 normalization: the set container retains strict descriptor and prototype checks without calling getters', () => {
  let calls = 0;
  const getter = () => { calls += 1; return 1; };
  const accessor = Object.defineProperty([], '0', { enumerable: true, get: getter });
  const hidden = Object.defineProperty([1], 'note', { value: 'hidden' });
  const extra = [1]; extra.note = 'extra';
  const symbol = [1]; symbol[Symbol('extra')] = true;
  const prototype = [1]; Object.setPrototypeOf(prototype, Object.create(Array.prototype));
  const ownMap = Object.defineProperty([1], 'map', { value: getter });
  const nested = [Object.defineProperty({}, 'value', { enumerable: true, get: getter })];
  for (const values of [Array(1), [, 1], accessor, hidden, extra, symbol, prototype, ownMap, nested]) {
    assert.throws(() => scopeSet(values), /SW-NORMALIZE/);
  }
  assert.equal(calls, 0, 'invalid descriptors must be rejected before invoking user code');
});

test('#300 normalization: containing-array cycles fail and shared acyclic selections become detached results', () => {
  const direct = []; direct.push(direct);
  const indirect = []; indirect.push({ selection: { owners: indirect } });
  for (const values of [direct, indirect]) assert.throws(() => scopeSet(values), /cyclic object/);

  const selection = Object.freeze({ cells: Object.freeze(['B', 'A']) });
  const values = Object.freeze([
    Object.freeze({ owner: 'screen:B', selection }), Object.freeze({ owner: 'screen:A', selection }),
  ]);
  const result = scopeSet(values);
  assert.deepEqual(result.map((entry) => entry.owner), ['screen:A', 'screen:B']);
  assert.notEqual(result[0].selection, result[1].selection);
  result[0].selection.cells.push('changed');
  assert.deepEqual(result[1].selection.cells, ['B', 'A']);
  assert.deepEqual(selection.cells, ['B', 'A']);
});

test('#300 normalization: representative binding data retains exact UTF-8 JSON bytes and digest', () => {
  const value = {
    target: { selection: { type: 'row', key: 'SM-1', headers: ['State', 'Meaning'], cells: ['Loading', 'ready'] },
      ref: 'unknown:U-1@COUPON-001-screen-spec' },
    owner: 'screen:COUPON-001',
    metadata: { '\u{1f600}': 'astral', '\ue000': 'private', '2': 2, '10': 10 },
    known_units: scopeSet(['\u{1f600}', '\u{10000}', '\uffff', '\ue000', '가', '2', '10']),
    basis_version: 2,
  };
  // This is a serialization witness, not a fabricated approval or full basis.
  const expected = '{"basis_version":2,"known_units":["10","2","가","\ue000","\uffff","\u{10000}","\u{1f600}"],"metadata":{"10":10,"2":2,"\ue000":"private","\u{1f600}":"astral"},"owner":"screen:COUPON-001","target":{"ref":"unknown:U-1@COUPON-001-screen-spec","selection":{"cells":["Loading","ready"],"headers":["State","Meaning"],"key":"SM-1","type":"row"}}}';
  const actual = scopeJson(scopeSet([value])[0]);
  assert.equal(actual, expected);
  assert.equal(createHash('sha256').update(actual, 'utf8').digest('hex'),
    'c6336f836b5a08edaf2c7082e7d2363bf9b4b29c2ab55f0e40fb307bd5e7332c');
});

test('#300 normalization: accepted root and nested Proxies keep their observable value semantics', () => {
  const root = new Proxy([1], { get(target, key, receiver) {
    return key === '0' ? 2 : Reflect.get(target, key, receiver);
  } });
  assert.deepEqual(scopeSet(root), [2]);

  let observed = 0;
  const nested = new Proxy({ value: 1 }, { getOwnPropertyDescriptor(target, key) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (key === 'value') descriptor.value = ++observed;
    return descriptor;
  } });
  assert.deepEqual(scopeSet([{ selection: { nested } }]), [{ selection: { nested: { value: 2 } } }]);
});

test('#300 normalization: a Proxy that exposes a later non-JSON value is still rejected', () => {
  for (const wrap of [(value) => value, (value) => ({ selection: { value } })]) {
    let observed = false;
    const value = new Proxy({ value: 1 }, { getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'value') { descriptor.value = observed ? NaN : 1; observed = true; }
      return descriptor;
    } });
    assert.throws(() => scopeSet([wrap(value)]), { name: 'TypeError', message: 'SW-NORMALIZE: non-finite number' });
  }
});

test('#300 normalization: a Proxy changing an earlier ordinary member cannot hide a duplicate', () => {
  const sibling = { value: 1 };
  const later = new Proxy({ value: 2 }, { getOwnPropertyDescriptor(target, key) {
    if (key === 'value') sibling.value += 1;
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  assert.throws(() => scopeSet([sibling, later], 'known_units'), {
    name: 'TypeError', message: 'SW-NORMALIZE: known_units: duplicate normalized member',
  });
});

test('#300 normalization: a Proxy-provided map result keeps its original sort protocol', () => {
  let sorts = 0;
  const values = new Proxy([1], { get(target, key, receiver) {
    if (key !== 'map') return Reflect.get(target, key, receiver);
    return (encode) => {
      const entries = [encode(2), encode(1)];
      entries.some = () => assert.fail('the existing Proxy path never inspects this method');
      entries.sort = function (compare) {
        sorts += 1;
        assert.equal(typeof compare, 'function', 'the original byte comparator remains supplied');
        return Array.prototype.sort.call(this, compare);
      };
      return entries;
    };
  } });
  assert.deepEqual(scopeSet(values), [1, 2]);
  assert.equal(sorts, 1);
});
