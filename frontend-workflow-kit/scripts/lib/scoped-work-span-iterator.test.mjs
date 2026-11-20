import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { sharedReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { rememberScopedSelection } from './scoped-work-authored.mjs';
import { createScopedGraphSelectionSpanResolver, scopedGraphSelectionSpans } from './scoped-work-graph.mjs';

const position = (start, end) => Object.freeze({
  start: Object.freeze({ offset: start }), end: Object.freeze({ offset: end }),
});
const leaf = (start, end) => Object.freeze({ type: 'text', position: position(start, end) });

for (const kind of ['accessor', 'data']) {
  test(`#348 span iterator: frozen children with a changing ${kind} iterator remain uncached`, () => {
    const first = leaf(0, 1), second = leaf(1, 2);
    let current = first, getterCalls = 0, iteratorCalls = 0;
    const children = [first];
    const iterate = function* () { iteratorCalls += 1; yield current; };
    Object.defineProperty(children, Symbol.iterator, kind === 'accessor'
      ? { get() { getterCalls += 1; return iterate; } } : { value: iterate });
    Object.freeze(children);
    const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
    const view = { tree: { children: [parent] } }, selection = { type: 'body' };
    const resolve = createScopedGraphSelectionSpanResolver();
    assert.deepEqual(resolve('ab', view, selection), [[0, 1]]);
    assert.equal(iteratorCalls, 1, 'eligibility cannot consume the user iterator');
    assert.equal(getterCalls, kind === 'accessor' ? 1 : 0);
    current = second;
    const changed = resolve('ab', view, selection);
    assert.deepEqual(changed, [[1, 2]]);
    assert.equal(iteratorCalls, 2, 'the actual native walk runs exactly once per call');
    assert.deepEqual(changed, scopedGraphSelectionSpans('ab', view, selection));
    assert.notEqual(resolve('ab', view, selection), changed, 'custom iteration never produces an internal shared result');
  });
}

test('#348 span iterator: a custom iterator on the selected node array is also observed once', () => {
  const first = leaf(0, 1), second = leaf(1, 2);
  let current = first, iterations = 0;
  const nodes = [first];
  Object.defineProperty(nodes, Symbol.iterator, { value: function* () { iterations += 1; yield current; } });
  Object.freeze(nodes);
  const selection = rememberScopedSelection({ type: 'section' }, 'ab', nodes);
  const resolve = createScopedGraphSelectionSpanResolver();
  assert.deepEqual(resolve('ab', null, selection), [[0, 1]]);
  current = second;
  assert.deepEqual(resolve('ab', null, selection), [[1, 2]]);
  assert.equal(iterations, 2, 'cache key construction must not make an extra custom traversal');
});

test('#348 span iterator: inherited iterator changes invalidate a previously eligible node', () => {
  const first = leaf(0, 1), second = leaf(1, 2), children = Object.freeze([first]);
  const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
  const view = { tree: { children: [parent] } }, selection = { type: 'body' };
  const resolve = createScopedGraphSelectionSpanResolver(), original = resolve('ab', view, selection);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  let actual, expected;
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, { ...descriptor, value: function* () {
      if (this === children) yield second;
      else yield* descriptor.value.call(this);
    } });
    actual = resolve('ab', view, selection);
    expected = scopedGraphSelectionSpans('ab', view, selection);
  } finally { Object.defineProperty(Array.prototype, Symbol.iterator, descriptor); }
  assert.deepEqual(original, [[0, 1]]);
  assert.deepEqual(actual, [[1, 2]]);
  assert.deepEqual(actual, expected);
  assert.equal(resolve('ab', view, selection), original, 'ordinary iteration may safely reuse its previous spans again');
});

test('#348 span iterator: an inherited custom iterator installed before resolver creation is not trusted', () => {
  const first = leaf(0, 1), second = leaf(1, 2), children = Object.freeze([first]);
  const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
  const view = { tree: { children: [parent] } }, selection = { type: 'body' };
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  let current = first, before, after;
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, { ...descriptor, value: function* () {
      if (this === children) yield current;
      else yield* descriptor.value.call(this);
    } });
    const resolve = createScopedGraphSelectionSpanResolver();
    before = resolve('ab', view, selection);
    current = second;
    after = resolve('ab', view, selection);
  } finally { Object.defineProperty(Array.prototype, Symbol.iterator, descriptor); }
  assert.deepEqual(before, [[0, 1]]);
  assert.deepEqual(after, [[1, 2]]);
});

for (const kind of ['data', 'accessor', 'proxy']) {
  for (const state of ['warm', 'cold']) {
    test(`#353 span iterator: ${kind} next changes stay fresh with a ${state} resolver`, () => {
      const first = leaf(0, 1), second = leaf(1, 2), children = Object.freeze([first]);
      const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
      const selection = rememberScopedSelection({ type: 'section' }, 'ab', [parent]);
      const prototype = Object.getPrototypeOf([][Symbol.iterator]());
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'next');
      let resolve = state === 'warm' ? createScopedGraphSelectionSpanResolver() : null;
      const original = resolve?.('ab', null, selection);
      let current = first, calls = 0, gets = 0;
      const next = function () {
        calls += 1;
        const step = descriptor.value.call(this);
        return step.value === first ? { done: false, value: current } : step;
      };
      const replacement = kind === 'accessor'
        ? { configurable: true, get() { gets += 1; return next; } }
        : { ...descriptor, value: kind === 'proxy' ? new Proxy(next, {}) : next };
      let before, after, repeated, fresh, actualCalls, actualGets, freshCalls, freshGets;
      try {
        Object.defineProperty(prototype, 'next', replacement);
        resolve ??= createScopedGraphSelectionSpanResolver();
        before = resolve('ab', null, selection);
        current = second; calls = 0; gets = 0;
        after = resolve('ab', null, selection);
        actualCalls = calls; actualGets = gets; calls = 0; gets = 0;
        fresh = scopedGraphSelectionSpans('ab', null, selection);
        freshCalls = calls; freshGets = gets;
        repeated = resolve('ab', null, selection);
      } finally { Object.defineProperty(prototype, 'next', descriptor); }
      assert.deepEqual(before, [[0, 1]]);
      assert.deepEqual(after, [[1, 2]]);
      assert.deepEqual(after, fresh);
      assert.notEqual(repeated, after, 'a changed next method never supplies a cached span array');
      assert.equal(actualCalls, freshCalls, 'eligibility must not advance the iterator');
      assert.equal(actualGets, freshGets, 'eligibility must not invoke the next accessor');
      assert.equal(actualGets, kind === 'accessor' ? 3 : 0, 'only the three actual native walks acquire next');
      const restored = resolve('ab', null, selection);
      assert.deepEqual(restored, [[0, 1]]);
      assert.equal(resolve('ab', null, selection), restored, 'restored traversal permits ordinary sharing');
      if (original) assert.equal(restored, original, 'custom traversal cannot replace a warm ordinary cache entry');
    });
  }
}

test('#353 span iterator: inherited next through a proxy ancestor keeps actual lookup semantics', () => {
  const first = leaf(0, 1), second = leaf(1, 2), children = Object.freeze([first]);
  const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children });
  const selection = rememberScopedSelection({ type: 'section' }, 'ab', [parent]);
  const resolve = createScopedGraphSelectionSpanResolver(), original = resolve('ab', null, selection);
  const prototype = Object.getPrototypeOf([][Symbol.iterator]());
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'next'), ancestor = Object.getPrototypeOf(prototype);
  let current = first, gets = 0, probes = 0;
  const next = function () {
    const step = descriptor.value.call(this);
    return step.value === first ? { done: false, value: current } : step;
  };
  const proxy = new Proxy(Object.create(ancestor), {
    get(target, key, receiver) {
      if (key === 'next') { gets += 1; return next; }
      return Reflect.get(target, key, receiver);
    },
    getOwnPropertyDescriptor(target, key) { probes += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  let before, after, fresh, actualGets, freshGets;
  try {
    Object.setPrototypeOf(prototype, proxy);
    delete prototype.next;
    before = resolve('ab', null, selection);
    current = second; gets = 0;
    after = resolve('ab', null, selection); actualGets = gets; gets = 0;
    fresh = scopedGraphSelectionSpans('ab', null, selection); freshGets = gets;
  } finally {
    Object.defineProperty(prototype, 'next', descriptor);
    Object.setPrototypeOf(prototype, ancestor);
  }
  assert.deepEqual(before, [[0, 1]]);
  assert.deepEqual(after, [[1, 2]]);
  assert.deepEqual(after, fresh);
  assert.equal(actualGets, freshGets, 'only the real walk may resolve next through the proxy');
  assert.equal(probes, 0, 'eligibility must not inspect a custom prototype chain');
  assert.equal(resolve('ab', null, selection), original, 'restoring next restores ordinary cache reuse');
});

for (const kind of ['next-data', 'next-accessor', 'next-proxy', 'next-inherited', 'next-inherited-native',
  'values-data', 'values-accessor', 'values-proxy', 'values-native']) {
  test(`#353 span iterator: ${kind} installed before module import cannot certify cached traversal`, () => {
    const source = `
      import assert from 'node:assert/strict';
      import { rememberScopedSelection } from ${JSON.stringify(new URL('./scoped-work-authored.mjs', import.meta.url).href)};
      const kind = ${JSON.stringify(kind)};
      const point = (offset) => Object.freeze({ offset });
      const position = (start, end) => Object.freeze({ start: point(start), end: point(end) });
      const first = Object.freeze({ type: 'text', position: position(0, 1) });
      const second = Object.freeze({ type: 'text', position: position(1, 2) });
      const parent = Object.freeze({ type: 'paragraph', position: position(0, 2), children: Object.freeze([first]) });
      const selection = rememberScopedSelection({ type: 'section' }, 'ab', [parent]);
      const prototype = Object.getPrototypeOf([][Symbol.iterator]());
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'next');
      const ancestor = Object.getPrototypeOf(prototype);
      const values = Object.getOwnPropertyDescriptor(Array.prototype, 'values');
      let current = first, valuesGets = 0, valuesCalls = 0, graph, resolve, before, after, fresh;
      const replace = (step) => step.value === first ? { done: false, value: current } : step;
      const next = function next() { return replace(descriptor.value.call(this)); };
      next.toString = () => 'function next() { [native code] }';
      const customValues = function values() { valuesCalls += 1; throw new Error('custom values must not run at import'); };
      try {
        if (kind === 'next-accessor') Object.defineProperty(prototype, 'next', { configurable: true, get: () => next });
        else if (kind.startsWith('next-inherited')) {
          Object.setPrototypeOf(prototype, Object.create(ancestor, {
            next: { ...descriptor, value: kind === 'next-inherited-native' ? descriptor.value : next },
          }));
          delete prototype.next;
        } else if (kind.startsWith('next-')) Object.defineProperty(prototype, 'next', {
          ...descriptor, value: kind === 'next-proxy' ? new Proxy(descriptor.value, {
            apply(target, receiver, args) { return replace(Reflect.apply(target, receiver, args)); },
          }) : next,
        });
        else if (kind === 'values-accessor') Object.defineProperty(Array.prototype, 'values', {
          configurable: true, get() { valuesGets += 1; return customValues; },
        });
        else Object.defineProperty(Array.prototype, 'values', {
          ...values, value: kind === 'values-native' ? Set.prototype.values
            : kind === 'values-proxy' ? new Proxy(customValues, {}) : customValues,
        });
        graph = await import(${JSON.stringify(new URL('./scoped-work-graph.mjs?preimport-iterator', import.meta.url).href)});
        resolve = graph.createScopedGraphSelectionSpanResolver();
        before = resolve('ab', null, selection);
        current = second;
        after = resolve('ab', null, selection);
        fresh = graph.scopedGraphSelectionSpans('ab', null, selection);
      } finally {
        Object.defineProperty(prototype, 'next', descriptor);
        Object.setPrototypeOf(prototype, ancestor);
        Object.defineProperty(Array.prototype, 'values', values);
      }
      assert.deepEqual(before, [[0, 1]]);
      assert.deepEqual(after, kind.startsWith('values-') || kind === 'next-inherited-native' ? [[0, 1]] : [[1, 2]]);
      assert.deepEqual(after, fresh);
      assert.equal(valuesGets, 0, 'bootstrap cannot invoke a custom values accessor');
      assert.equal(valuesCalls, 0, 'bootstrap cannot invoke a custom values function');
      const restored = resolve('ab', null, selection);
      assert.deepEqual(restored, [[0, 1]]);
      if (kind.startsWith('next-')) assert.equal(resolve('ab', null, selection), restored,
        'restored verified native next permits ordinary internal sharing');
    `;
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      env, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
  });
}

test('#348 span iterator: ordinary parser nodes share internal spans and public results stay independent', () => {
  const body = '## Facts\n\nFirst paragraph.\n\nSecond paragraph.\n';
  const view = sharedReconciliationReferenceView(body), nodes = view.sections[1].nodes;
  const selection = rememberScopedSelection({ type: 'section' }, body, [...nodes]);
  const other = rememberScopedSelection({ type: 'section' }, body, [...nodes]);
  const resolve = createScopedGraphSelectionSpanResolver(), first = resolve(body, view, selection);
  assert.equal(resolve(body, view, other), first);
  assert.ok(Object.isFrozen(first) && first.every(Object.isFrozen));
  const publicFirst = scopedGraphSelectionSpans(body, view, selection);
  const publicSecond = scopedGraphSelectionSpans(body, view, other);
  assert.notEqual(publicFirst, publicSecond);
  assert.notEqual(publicFirst[0], publicSecond[0]);
  publicFirst[0][0] = -1;
  assert.deepEqual(publicSecond, first);
});
