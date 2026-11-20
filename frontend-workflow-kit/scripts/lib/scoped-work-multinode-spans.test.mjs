import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInputArtifact } from './input-artifact.mjs';
import { splitFrontmatter } from './util.mjs';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { rememberScopedSelection, scopedSelectionNodes } from './scoped-work-authored.mjs';
import { createScopedGraphSelectionSpanResolver, resolveScopedContractGraph,
  scopedGraphSelectionSpans } from './scoped-work-graph.mjs';

const select = (body, nodes, fields = {}) => rememberScopedSelection({ type: 'section', ...fields }, body, nodes);

test('#342 physical spans: separate input graphs share a multi-node sequence within one evaluation', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-multinode-spans-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const id = 'IN-20261120-meeting-001', file = path.join(root, `${id}.md`);
  const fm = { input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:synthetic',
    captured_at: '2026-11-20T00:00:00Z', captured_by: 'synthetic-test', status: 'captured',
    affected_domains: ['example'], affected_screens: ['EXAMPLE-001'] };
  const raw = `---\n${JSON.stringify(fm)}\n---\n\n## Summary\n\nFirst **paragraph**.\n\nSecond [paragraph](https://example.invalid/source).\n`;
  fs.writeFileSync(file, raw);
  const { body } = splitFrontmatter(raw), ref = `input:${id}#summary`;
  const options = { contracts: [ref], targetIndex: { artifacts: new Map(), duplicates: new Set() },
    inputArtifacts: [loadInputArtifact(file)], projectRoot: root };
  const selections = [0, 1].map(() => resolveScopedContractGraph(options).nodes.find((node) => node.ref === ref).selection);
  const left = scopedSelectionNodes(body, selections[0]), right = scopedSelectionNodes(body, selections[1]);
  assert.notEqual(selections[0], selections[1]);
  assert.notEqual(left, right, 'independent source views need not share the wrapper array');
  assert.equal(left.length, 2);
  assert.ok(left.every((node, index) => node === right[index]));
  const view = sharedReconciliationReferenceView(body), spans = createScopedGraphSelectionSpanResolver();
  const first = spans(body, view, selections[0], true), second = spans(body, view, selections[1], true);
  assert.equal(first.length, 6);
  assert.equal(second, first, 'the ordered native identities identify one physical selection');
  assert.ok(Object.isFrozen(first) && first.every(Object.isFrozen));
  const nextEvaluation = createScopedGraphSelectionSpanResolver()(body, view, selections[0], true);
  assert.notEqual(nextEvaluation, first);
  assert.deepEqual(nextEvaluation, first);
  const publicFirst = scopedGraphSelectionSpans(body, view, selections[0], true);
  const publicSecond = scopedGraphSelectionSpans(body, view, selections[1], true);
  assert.notEqual(publicFirst, publicSecond); assert.notEqual(publicFirst[0], publicSecond[0]);
  publicFirst[0][0] = -1;
  assert.deepEqual(publicSecond, first, 'public mutable ranges remain independent of internal cached ranges');
});

test('#342 physical spans: order, length, repeated nodes and replaced selection arrays remain distinct', () => {
  const body = '## Summary\n\nSame text.\n\nSame text.\n\nLast text.\n';
  const view = sharedReconciliationReferenceView(body), [a, b, c] = view.sections[1].nodes;
  const spans = createScopedGraphSelectionSpanResolver(), mutableNodes = [a, b];
  const original = select(body, mutableNodes), first = spans(body, view, original);
  assert.equal(spans(body, view, select(body, [a, b])), first);
  const reversed = spans(body, view, select(body, [b, a]));
  assert.notEqual(reversed, first); assert.deepEqual(reversed, [...first].reverse());
  const prefix = spans(body, view, select(body, [a]));
  const extension = spans(body, view, select(body, [a, b, c]));
  const repeated = spans(body, view, select(body, [a, a]));
  assert.equal(prefix.length, 1); assert.equal(extension.length, 3);
  assert.deepEqual(repeated, [first[0], first[0]]);
  assert.notEqual(repeated, first, 'equal prose at different physical locations cannot be interchanged');
  mutableNodes.reverse();
  assert.equal(spans(body, view, original), reversed, 'each call resolves the current ordered node list');
  mutableNodes.splice(0, mutableNodes.length, a, b);
  assert.equal(spans(body, view, original), first);
});

test('#342 physical spans: multi-node input nesting mode is isolated from whole-node ranges', () => {
  const body = '## Facts\n\n- Parent.\n  - Nested child.\n\nAfter list.\n';
  const view = sharedReconciliationReferenceView(body), home = view.sections[1];
  const nodes = [home.bulletNodes[0], home.nodes[1]], spans = createScopedGraphSelectionSpanResolver();
  const selection = select(body, nodes, { bullet_index: 1 });
  const full = spans(body, view, selection), input = spans(body, view, select(body, [...nodes], { bullet_index: 1 }), true);
  const text = (ranges) => ranges.map(([start, end]) => body.slice(start, end)).join(' ');
  assert.match(text(full), /Nested child/); assert.doesNotMatch(text(input), /Nested child/);
  assert.match(text(input), /Parent/); assert.match(text(input), /After list/);
  assert.equal(spans(body, view, selection, true), input);
  selection.bullet_index = null;
  assert.equal(spans(body, view, selection, true), full);
});

test('#342 physical spans: exact bodies and reparsed native generations do not share ranges', () => {
  const body = '## Summary\n\nOne paragraph.\n\nAnother paragraph.\n';
  const view = sharedReconciliationReferenceView(body), nodes = view.sections[1].nodes;
  const spans = createScopedGraphSelectionSpanResolver(), selection = select(body, [...nodes]);
  const first = spans(body, view, selection);
  const changed = `${body}\nChanged.`;
  assert.throws(() => spans(changed, view, selection), /selection body changed/);
  const otherBody = spans(changed, view, select(changed, [...nodes]));
  assert.notEqual(otherBody, first, 'native identity alone cannot replace the exact-source body check');
  for (let i = 0; i < 512; i += 1) parseReconciliationReferenceView(`multinode-eviction-${i}\n`);
  const reparsed = sharedReconciliationReferenceView(body), freshNodes = reparsed.sections[1].nodes;
  assert.notEqual(freshNodes[0], nodes[0]);
  assert.deepEqual(freshNodes.map((node) => node.position), nodes.map((node) => node.position));
  const fresh = spans(body, reparsed, select(body, [...freshNodes]));
  assert.notEqual(fresh, first, 'equal offsets from another native generation are distinct physical identities');
  assert.deepEqual(fresh, first);
});

test('#342 physical spans: a mutable descendant in a multi-node sequence keeps fresh computation', () => {
  const body = '## Summary\n\nOne paragraph.\n\nAnother paragraph.\n';
  const view = sharedReconciliationReferenceView(body), [first, second] = view.sections[1].nodes;
  const mutable = structuredClone(second), selection = select(body, [first, mutable]);
  const spans = createScopedGraphSelectionSpanResolver(), before = spans(body, view, selection);
  mutable.children[0].position.start.offset += 1;
  const after = spans(body, view, selection);
  assert.notEqual(after, before); assert.equal(after[1][0], before[1][0] + 1);
  assert.notEqual(spans(body, view, selection), after, 'partial frozen prefixes cannot certify a mutable sequence');
});
