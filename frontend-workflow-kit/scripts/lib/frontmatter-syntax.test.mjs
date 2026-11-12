import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parse as yamlParse } from 'yaml';
import { createFrontmatterParser } from './frontmatter-syntax.mjs';

const MODULE_URL = new URL('./frontmatter-syntax.mjs', import.meta.url).href;
const PACKAGE_URL = new URL('../../package.json', import.meta.url).href;

// Capture the real parser's synchronous warning calls without letting a mock
// leak into test-runner hooks. Warning stacks are caller-specific; the public
// diagnostic text, code and source locations are the comparable observation.
function observed(parse, source) {
  const warnings = [];
  const original = process.emitWarning;
  process.emitWarning = (warning) => warnings.push(typeof warning === 'string' ? warning : {
    name: warning.name, message: warning.message, code: warning.code,
    pos: warning.pos, linePos: warning.linePos,
  });
  try {
    try { return { value: parse(source), warnings }; }
    catch (error) { return { error: { name: error.name, message: error.message }, warnings }; }
  } finally {
    process.emitWarning = original;
  }
}

function instrumented(body) {
  // A fresh process installs instrumentation before the helper captures YAML's
  // CommonJS named exports. These are actual parser calls, not a test-only cache
  // implementation or production diagnostics API.
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(PACKAGE_URL)});
    const yaml = require('yaml');
    const v8 = require('node:v8');
    const originalParse = yaml.parse;
    const originalDocument = yaml.parseDocument;
    const originalSerialize = v8.serialize;
    const originalDeserialize = v8.deserialize;
    const counts = { parse: 0, document: 0, serialize: 0, deserialize: 0 };
    let failSerialization = false;
    let failDeserialization = false;
    yaml.parse = function(...args) { counts.parse++; return originalParse.apply(this, args); };
    yaml.parseDocument = function(...args) { counts.document++; return originalDocument.apply(this, args); };
    v8.serialize = function(...args) {
      counts.serialize++;
      if (failSerialization) throw new Error('synthetic serialization failure');
      return originalSerialize.apply(this, args);
    };
    v8.deserialize = function(...args) {
      counts.deserialize++;
      if (failDeserialization) throw new Error('synthetic deserialization failure');
      return originalDeserialize.apply(this, args);
    };
    const { createFrontmatterParser } = await import(${JSON.stringify(MODULE_URL)});
    ${body}
    process.stdout.write('verified');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, 'verified');
  assert.equal(result.stderr, '');
}

test('#300 frontmatter syntax: validates limits and preserves uncached input behavior', () => {
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null]) {
    assert.throws(() => createFrontmatterParser({ maxBytes: value }), RangeError);
    assert.throws(() => createFrontmatterParser({ maxEntries: value }), RangeError);
  }
  for (const options of [{ maxBytes: 0 }, { maxEntries: 0 }]) {
    const parse = createFrontmatterParser(options);
    for (const source of ['key: value', null, undefined, 42, false]) {
      assert.deepEqual(observed(parse, source), observed(yamlParse, source));
    }
  }
});

test('#300 frontmatter syntax: cold and repeated results match the real YAML parser', () => {
  const parse = createFrontmatterParser();
  const sources = ['', '# only a comment', 'null', '~', 'false', 'true', '0', '-0', '42',
    '.inf', '-.inf', '.nan', 'plain text', '"한글 😀"', '"\\uD800"', '"\\uD801"',
    '[]', '{}', '[false, 0, null, "", -0, .inf, .nan]',
    'status: captured\naffected_screens: [ONE, TWO]\nmetadata: {count: 2, active: true}',
    'literal: |\n  line one\n  line two\nfolded: >-\n  same\n  line\n',
    'value: one\r\nnext: [two, three]\r\n',
    '?\n: null key\ntrue: boolean key\n2: numeric key\n"true": last spelling',
    '"10": ten\n"2": two\n"01": one\nconstructor: value\n__proto__: {kept: true}',
  ];
  for (const source of sources) {
    const expected = observed(yamlParse, source);
    for (let read = 0; read < 3; read++) assert.deepEqual(observed(parse, source), expected, JSON.stringify(source));
  }
});

test('#300 frontmatter syntax: cache hits retain special keys, descriptors and numeric values', () => {
  const source = '__proto__: {kept: true}\nconstructor: value\ntoString: own\nnested: {__proto__: [one, two]}\nnegative: -0\nnot_a_number: .nan\ninfinity: .inf';
  const parse = createFrontmatterParser();
  const expected = yamlParse(source);
  for (let read = 0; read < 3; read++) {
    const actual = parse(source);
    assert.deepEqual(actual, expected);
    assert.deepEqual(Reflect.ownKeys(actual), Reflect.ownKeys(expected));
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(Object.getPrototypeOf(actual.nested), Object.prototype);
    for (const key of ['__proto__', 'constructor', 'toString']) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(actual, key), Object.getOwnPropertyDescriptor(expected, key));
    }
    assert.equal(Object.is(actual.negative, -0), true);
    assert.equal(Number.isNaN(actual.not_a_number), true);
    assert.equal(actual.infinity, Infinity);
  }
});

test('#300 frontmatter syntax: callers cannot mutate the cached first or later results', () => {
  const source = 'owner: {name: first, units: [one, two]}\n__proto__: {own: true}';
  const parse = createFrontmatterParser();
  const expected = yamlParse(source);
  const first = parse(source);
  first.owner.name = 'changed';
  first.owner.units.push('poison');
  first.__proto__.own = false;
  Object.setPrototypeOf(first.owner, null);
  const second = parse(source);
  assert.deepEqual(second, expected);
  assert.notEqual(second.owner, first.owner);
  second.owner.units.length = 0;
  delete second.__proto__;
  assert.deepEqual(parse(source), expected);
});

test('#300 frontmatter syntax: malformed documents and alias limits keep exact errors on every call', () => {
  const parse = createFrontmatterParser();
  const sources = ['value: [unclosed', 'value: *missing', 'value: one\nvalue: two',
    '\tbad: indentation', 'value: "bad\\qescape"',
    `base: &base [one]\ncopies: [${Array(101).fill('*base').join(', ')}]`];
  for (const source of sources) {
    const expected = observed(yamlParse, source);
    assert.ok(expected.error, source);
    assert.deepEqual(observed(parse, source), expected);
    assert.deepEqual(observed(parse, source), expected);
  }
});

test('#300 frontmatter syntax: aliases and cycles keep intra-result identity and cross-call isolation', () => {
  const parse = createFrontmatterParser();
  const alias = 'source: &source {values: [one, two]}\ncopy: *source';
  const cyclic = 'source: &source {self: *source}';
  for (const source of [alias, cyclic]) {
    const first = parse(source);
    const second = parse(source);
    assert.deepEqual(first, yamlParse(source));
    assert.deepEqual(second, yamlParse(source));
    assert.notEqual(first.source, second.source);
    if (source === alias) {
      assert.equal(first.source, first.copy);
      assert.equal(second.source, second.copy);
      first.copy.values.push('mutation');
      assert.deepEqual(second.source.values, ['one', 'two']);
    } else {
      assert.equal(first.source.self, first.source);
      assert.equal(second.source.self, second.source);
      first.source.changed = true;
      assert.equal(Object.hasOwn(second.source, 'changed'), false);
    }
  }
});

test('#300 frontmatter syntax: directives, tags and native YAML values retain fallback semantics', () => {
  const parse = createFrontmatterParser();
  const sources = ['%YAML 1.1\n---\nyes', '---\nvalue: one\n...',
    'value: !!timestamp 2001-12-15T02:59:43.1Z', 'value: !!binary SGVsbG8=',
    'value: !!set {one, two}', 'value: !!omap [one: 1, two: 2]',
    '%YAML 1.1\n---\nbase: &base {a: 1}\nmerged: {<<: *base, b: 2}',
    '%TAG !e! tag:example.com,2026:\n---\nvalue: !e!custom text'];
  for (const source of sources) {
    const expected = observed(yamlParse, source);
    for (let read = 0; read < 3; read++) assert.deepEqual(observed(parse, source), expected, source);
  }
});

test('#300 frontmatter syntax: parser and collection-key warnings are emitted on every call', () => {
  const parse = createFrontmatterParser();
  for (const source of ['value: !unrecognized text', '? [one, two]\n: value', '%YAML 1.3\n---\nvalue: one']) {
    const expected = observed(yamlParse, source);
    assert.ok(expected.warnings.length > 0, source);
    for (let read = 0; read < 3; read++) assert.deepEqual(observed(parse, source), expected, source);
  }
});

test('#300 frontmatter syntax: exact source hits avoid parsing and renew the entry-count LRU', () => {
  instrumented(`
    const parse = createFrontmatterParser({ maxBytes: 10000, maxEntries: 2 });
    for (const source of ['a: one', 'b: two', 'a: one', 'c: three', 'a: one']) {
      assert.deepEqual(parse(source), originalParse(source));
    }
    assert.equal(counts.document, 3);
    assert.equal(counts.parse, 0);
    assert.deepEqual(parse('b: two'), { b: 'two' });
    assert.equal(counts.document, 4, 'the least recently used source was evicted');
    assert.deepEqual(parse('b: two'), { b: 'two' });
    assert.equal(counts.document, 4);
  `);
});

test('#300 frontmatter syntax: the byte budget includes the exact UTF-16 key and serialized result', () => {
  instrumented(`
    const source = 'name: 한글 😀';
    const value = originalParse(source);
    const cost = 2 * source.length + originalSerialize(value).length;
    for (const [maxBytes, expectedMisses] of [[cost, 1], [cost - 1, 2]]) {
      const parse = createFrontmatterParser({ maxBytes, maxEntries: 10 });
      const before = counts.document;
      assert.deepEqual(parse(source), value);
      assert.deepEqual(parse(source), value);
      assert.equal(counts.document - before, expectedMisses);
    }
    const disabled = createFrontmatterParser({ maxBytes: 0 });
    const before = counts.parse;
    disabled(source); disabled(source);
    assert.equal(counts.parse - before, 2);
  `);
});

test('#300 frontmatter syntax: oversized keys and values do not displace admitted entries', () => {
  instrumented(`
    const small = 'a: small';
    const value = originalParse(small);
    const budget = 2 * small.length + originalSerialize(value).length;
    const parse = createFrontmatterParser({ maxBytes: budget, maxEntries: 10 });
    parse(small);
    const largeSource = 'long: ' + 'x'.repeat(budget);
    assert.deepEqual(parse(largeSource), originalParse(largeSource));
    assert.deepEqual(parse(largeSource), originalParse(largeSource));
    assert.equal(counts.parse, 2, 'oversized source uses the unchanged parser');
    assert.equal(counts.document, 1);
    assert.deepEqual(parse(small), value);
    assert.equal(counts.document, 1, 'oversized source must not evict the admitted entry');
    const largeValue = '[{},{},{},{}]';
    assert.ok(2 * largeValue.length <= budget);
    assert.ok(2 * largeValue.length + originalSerialize(originalParse(largeValue)).length > budget);
    parse(largeValue); parse(largeValue);
    assert.equal(counts.document, 3, 'oversized values are recomputed');
    assert.deepEqual(parse(small), value);
    assert.equal(counts.document, 3, 'oversized values must not evict the admitted entry');
  `);
});

test('#300 frontmatter syntax: byte pressure evicts the least recently used entry', () => {
  instrumented(`
    const source = 'name: a';
    const cost = 2 * source.length + originalSerialize(originalParse(source)).length;
    const parse = createFrontmatterParser({ maxBytes: cost * 2, maxEntries: 10 });
    for (const name of ['a', 'b', 'a', 'c', 'a']) assert.deepEqual(parse('name: ' + name), { name });
    assert.equal(counts.document, 3);
    assert.deepEqual(parse('name: b'), { name: 'b' });
    assert.equal(counts.document, 4);
  `);
});

test('#300 frontmatter syntax: cache keys distinguish line endings and lone UTF-16 surrogates', () => {
  instrumented(`
    const parse = createFrontmatterParser();
    const sources = ['key: value\\n', 'key: value\\r\\n',
      'value: "' + String.fromCharCode(0xd800) + '"',
      'value: "' + String.fromCharCode(0xd801) + '"',
      'value: "' + String.fromCharCode(0xfffd) + '"'];
    assert.equal(Buffer.from(sources[2]).equals(Buffer.from(sources[3])), true,
      'UTF-8 alone would conflate distinct source strings');
    for (let pass = 0; pass < 2; pass++) for (const source of sources) {
      assert.deepEqual(parse(source), originalParse(source));
    }
    assert.equal(counts.document, sources.length);
  `);
});

test('#300 frontmatter syntax: serialization failure returns parsed data without admitting it', () => {
  instrumented(`
    const parse = createFrontmatterParser();
    const source = 'nested: {value: original}';
    failSerialization = true;
    const first = parse(source);
    assert.deepEqual(first, originalParse(source));
    first.nested.value = 'mutated';
    assert.deepEqual(parse(source), originalParse(source));
    assert.equal(counts.document, 2);
    failSerialization = false;
    assert.deepEqual(parse(source), originalParse(source));
    assert.equal(counts.document, 3);
    assert.deepEqual(parse(source), originalParse(source));
    assert.equal(counts.document, 3, 'a later successful serialization can be admitted');
  `);
});

test('#300 frontmatter syntax: an unreadable cache entry is reparsed without losing the remaining budget', () => {
  instrumented(`
    const source = 'name: a';
    const cost = 2 * source.length + originalSerialize(originalParse(source)).length;
    const parse = createFrontmatterParser({ maxBytes: cost * 2, maxEntries: 10 });
    parse('name: a'); parse('name: b');
    failDeserialization = true;
    assert.deepEqual(parse('name: a'), { name: 'a' });
    assert.equal(counts.document, 3, 'a decode failure reparses the actual source');
    failDeserialization = false;
    assert.deepEqual(parse('name: b'), { name: 'b' });
    assert.deepEqual(parse('name: a'), { name: 'a' });
    assert.equal(counts.document, 3, 'removing the unreadable entry releases its accounted bytes');
  `);
});

test('#300 frontmatter syntax: repeated fallback skips eligibility work but keeps fresh errors and warnings', () => {
  instrumented(`
    const parse = createFrontmatterParser();
    const originalWarning = process.emitWarning;
    let warnings = [];
    process.emitWarning = (warning) => warnings.push(typeof warning === 'string' ? warning : warning.message);
    const sources = ['value: !unrecognized text', '? [one, two]\\n: value', 'value: [unclosed'];
    try {
      for (const source of sources) {
        warnings = [];
        let expectedValue, expectedError;
        try { expectedValue = originalParse(source); } catch (error) { expectedError = error; }
        const expectedWarnings = [...warnings];
        let previousError;
        for (let read = 0; read < 3; read++) {
          warnings = [];
          let actualValue, actualError;
          try { actualValue = parse(source); } catch (error) { actualError = error; }
          assert.deepEqual(warnings, expectedWarnings);
          if (expectedError) {
            assert.equal(actualError.name, expectedError.name);
            assert.equal(actualError.message, expectedError.message);
            assert.notEqual(actualError, previousError, 'each fallback still parses and creates its own error');
            previousError = actualError;
          } else {
            assert.equal(actualError, undefined);
            assert.deepEqual(actualValue, expectedValue);
            actualValue.changed = true;
          }
        }
      }
      assert.equal(counts.document, sources.length, 'one eligibility check per admitted source');
      assert.equal(counts.parse, sources.length * 3, 'the original parser runs on every fallback call');
    } finally {
      process.emitWarning = originalWarning;
    }
  `);
});

test('#300 frontmatter syntax: fallback markers share byte and entry eviction with decoded values', () => {
  instrumented(`
    const marker = 'source: &source [one]\\ncopy: *source';
    const stable = 'name: stable';
    const other = 'name: second';
    const valueCost = 2 * stable.length + originalSerialize(originalParse(stable)).length;
    const markerCost = 2 * marker.length;
    for (const options of [
      { maxBytes: markerCost + valueCost, maxEntries: 10 },
      { maxBytes: 10000, maxEntries: 2 },
    ]) {
      const parse = createFrontmatterParser(options);
      const before = { ...counts };
      for (const source of [marker, stable, marker, other, marker]) {
        assert.deepEqual(parse(source), originalParse(source));
      }
      assert.equal(counts.document - before.document, 3);
      assert.equal(counts.parse - before.parse, 3);
      assert.deepEqual(parse(stable), originalParse(stable));
      assert.equal(counts.document - before.document, 4, 'the marker renews recency and evicts the older decoded entry');
      assert.deepEqual(parse(marker), originalParse(marker));
      assert.equal(counts.document - before.document, 4);
      assert.equal(counts.parse - before.parse, 4);
    }
  `);
});
