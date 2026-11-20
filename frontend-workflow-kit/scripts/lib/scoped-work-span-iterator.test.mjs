import test from 'node:test';
import assert from 'node:assert/strict';
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
