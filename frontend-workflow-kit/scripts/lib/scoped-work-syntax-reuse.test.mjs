import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedReconciliationReferenceView, reconciliationParseStats, reconciliationSyntaxCacheStats,
  withReconciliationSyntax, withReconciliationSyntaxReuse } from './reconciliation-markdown-ast.mjs';

const longBody = (name) => `## ${name}\n\n~~~\n${'x'.repeat(8 * 1024 * 1024)}\n~~~\n`;
const parsed = () => reconciliationParseStats().parsed;
const bounded = () => {
  const stats = reconciliationSyntaxCacheStats();
  assert.equal(stats.max_source_chars, 8 * 1024 * 1024);
  assert.equal(stats.max_nodes, 262144);
  assert.equal(stats.max_entries, 512);
  assert.ok(stats.source_chars <= stats.max_source_chars);
  assert.ok(stats.nodes <= stats.max_nodes);
  assert.ok(stats.entries <= stats.max_entries);
};

test('#345 syntax reuse: repeated oversized dependency uses one tree only inside its evaluation', () => {
  const body = longBody('Evaluation source'), before = parsed();
  let first;
  assert.equal(withReconciliationSyntaxReuse(() => {
    first = sharedReconciliationReferenceView(body);
    for (let i = 0; i < 4; i += 1) {
      sharedReconciliationReferenceView(`## Small dependency ${i}\n\nOther syntax.\n`);
      assert.equal(sharedReconciliationReferenceView(body), first);
    }
    bounded();
    return 19;
  }), 19);
  assert.equal(parsed() - before, 5, 'one oversized tree and four ordinary small documents');
  const after = parsed(), next = sharedReconciliationReferenceView(body);
  assert.notEqual(next.tree, first.tree, 'completed evaluation cannot admit the oversized tree into the LRU');
  assert.equal(parsed() - after, 1);
  bounded();
});

test('#345 syntax reuse: only one oversized dependency slot is retained and host lexical pins still win', () => {
  const a = longBody('Overflow A'), b = longBody('Overflow B'), host = longBody('Current host');
  const before = parsed();
  withReconciliationSyntax(host, () => {
    const hostView = sharedReconciliationReferenceView(host);
    withReconciliationSyntaxReuse(() => {
      const first = sharedReconciliationReferenceView(a);
      sharedReconciliationReferenceView(b);
      const again = sharedReconciliationReferenceView(a);
      assert.notEqual(again.tree, first.tree, 'B evicts the single overflow slot, not a hidden unbounded tree map');
      assert.equal(sharedReconciliationReferenceView(host), hostView, 'an explicitly active host is separate from the dependency slot');
      assert.equal(sharedReconciliationReferenceView(a), again);
    });
  });
  assert.equal(parsed() - before, 4, 'host once and dependency sequence A/B/A');
  bounded();
});

test('#345 syntax reuse: nested evaluations restore outer state after return and exception', () => {
  const a = longBody('Outer evaluation'), b = longBody('Inner evaluation'), failure = new Error('nested source failure');
  let outer, inner;
  withReconciliationSyntaxReuse(() => {
    outer = sharedReconciliationReferenceView(a);
    assert.throws(() => withReconciliationSyntaxReuse(() => {
      inner = sharedReconciliationReferenceView(b);
      assert.equal(sharedReconciliationReferenceView(b), inner);
      throw failure;
    }), (error) => error === failure);
    assert.equal(sharedReconciliationReferenceView(a), outer);
    withReconciliationSyntaxReuse(() => {
      assert.notEqual(sharedReconciliationReferenceView(b).tree, inner.tree);
    });
    assert.equal(sharedReconciliationReferenceView(a), outer);
  });
  assert.notEqual(sharedReconciliationReferenceView(a).tree, outer.tree);
  bounded();
});

test('#345 syntax reuse: escaped async continuations cannot inherit a finished overflow slot', async () => {
  const body = longBody('Async boundary'), before = parsed();
  let original;
  const later = withReconciliationSyntaxReuse(() => {
    original = sharedReconciliationReferenceView(body);
    return Promise.resolve().then(() => sharedReconciliationReferenceView(body));
  });
  assert.notEqual((await later).tree, original.tree);
  assert.equal(parsed() - before, 2);
  bounded();
});

test('#345 syntax reuse: a dense node-limit dependency also reuses only one parse', () => {
  const body = '## Dense dependency\n\n' + '- one\n'.repeat(88000), before = parsed();
  withReconciliationSyntaxReuse(() => {
    const first = sharedReconciliationReferenceView(body);
    assert.equal(sharedReconciliationReferenceView(body), first);
    assert.equal(sharedReconciliationReferenceView(body), first);
    bounded();
  });
  assert.equal(parsed() - before, 1);
  assert.ok(body.length < reconciliationSyntaxCacheStats().max_source_chars, 'this exercises the node budget, not source size');
});
