import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInputArtifact } from './input-artifact.mjs';
import { splitFrontmatter } from './util.mjs';
import { hashBytes, CURRENT_WORK_INPUT_LIMIT } from './current-work-request.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats,
  isSharedReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { createScopedSourceResolver, scopedSourceResolverView } from './scoped-work-sources.mjs';
import { resolveScopedContractGraph, resolveScopedCandidateGraph,
  scopedGraphSelectionSpans } from './scoped-work-graph.mjs';
import { scopedSelectionNodes } from './scoped-work-authored.mjs';

const ID = 'IN-20261120-meeting-346', REF = `input:${ID}#extracted-facts/1`;
const metadata = { input_id: ID, input_type: 'meeting', source_type: 'meeting',
  source_ref: 'meeting:input-syntax-fixture', captured_at: '2026-11-20T00:00:00Z',
  captured_by: 'test', status: 'captured', affected_domains: ['input-syntax'], affected_screens: ['INPUT-001'] };
const markdown = (body, fm = metadata) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const smallBody = '## Extracted Facts\n\n- One selected fact.\n- Another unselected fact.\n';
const runGraph = {
  strict: (options, project) => resolveScopedContractGraph({ ...options, contracts: [REF], project }),
  candidate: (options, project) => resolveScopedCandidateGraph({ ...options, roots: [{ ref: REF, mode: 'ordinary' }], project }),
};
const records = (graph) => graph.nodes.map((node) => node.record || node);

function fixture(t, body = smallBody) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-input-syntax-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, `${ID}.md`);
  const write = (value, fm = metadata) => fs.writeFileSync(file, markdown(value, fm));
  write(body);
  const options = () => ({ projectRoot: root, targetIndex: { artifacts: new Map(), duplicates: new Set() },
    inputArtifacts: [loadInputArtifact(file)] });
  return { root, file, write, options, body: () => splitFrontmatter(fs.readFileSync(file, 'utf8')).body };
}

function bounded() {
  const cache = reconciliationSyntaxCacheStats();
  assert.ok(cache.source_chars <= cache.max_source_chars && cache.nodes <= cache.max_nodes && cache.entries <= cache.max_entries);
}

test('#346 input syntax: exact-body lookup borrows only this source resolver\'s immutable selected view', (t) => {
  const f = fixture(t), options = f.options(), source = createScopedSourceResolver(options), body = f.body();
  const before = reconciliationParseStats();
  assert.equal(scopedSourceResolverView(source, ID, body), null, 'view lookup must not read or parse an unselected input');
  assert.deepEqual(reconciliationParseStats(), before);
  const evidence = source.evidence(REF), view = scopedSourceResolverView(source, ID, body);
  assert.equal(isSharedReconciliationReferenceView(body, view), true);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.sections) && Object.isFrozen(view.tree));
  assert.equal(evidence.anchor.content, 'One selected fact.');
  assert.equal(scopedSourceResolverView(source, ID, `${body}\nChanged.`), null);
  assert.equal(scopedSourceResolverView(source, 'OTHER', body), null);
  assert.equal(scopedSourceResolverView({ ...source }, ID, body), null, 'a copied resolver has no source-view identity');
  evidence.input.metadata.status = 'returned-only';
  assert.equal(source.evidence(REF).input.metadata.status, 'captured', 'the private view does not change mutable result isolation');
});

test('#346 input syntax: source-limit overflow parses once per graph and preserves every output byte', (t) => {
  const f = fixture(t), expected = Object.fromEntries(Object.entries(runGraph).map(([name, run]) => [name, run(f.options())]));
  const body = `${smallBody}\n## Background\n\n~~~\n${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)}\n~~~\n`;
  f.write(body);
  assert.ok(body.length > reconciliationSyntaxCacheStats().max_source_chars);
  assert.ok(fs.statSync(f.file).size < CURRENT_WORK_INPUT_LIMIT);
  const options = f.options(), currentBody = f.body();
  const expectedReadSet = [{ file: `${ID}.md`, sha256: hashBytes(fs.readFileSync(f.file)) }];
  for (const [name, run] of Object.entries(runGraph)) {
    const before = reconciliationParseStats().parsed, first = run(options);
    assert.equal(reconciliationParseStats().parsed - before, 1, `${name}: source validation, raw selection and graph view share one parse`);
    assert.deepEqual(first, { ...expected[name], read_set: expectedReadSet }, 'unselected padding changes only the file observation');
    const selection = records(first)[0].selection, firstNative = scopedSelectionNodes(currentBody, selection)[0];
    const start = currentBody.indexOf('One selected fact.'), end = start + 'One selected fact.'.length;
    assert.deepEqual(scopedGraphSelectionSpans(currentBody, null, selection, true), [[start, end]]);
    const again = reconciliationParseStats().parsed, second = run(options);
    assert.equal(reconciliationParseStats().parsed - again, 1, `${name}: an independent graph does not inherit an oversized pin`);
    assert.deepEqual(second, first);
    assert.notEqual(scopedSelectionNodes(currentBody, records(second)[0].selection)[0], firstNative,
      'retaining an earlier public selection cannot lend its AST to another graph');
    bounded();
  }
});

test('#346 input syntax: node-limit overflow also parses once for each strict and candidate graph', (t) => {
  const body = `## Extracted Facts\n\n${'- one\n'.repeat(88000)}`, f = fixture(t, body);
  assert.ok(body.length < reconciliationSyntaxCacheStats().max_source_chars, 'this case isolates the native-node budget');
  const options = f.options(), currentBody = f.body(), initialOversized = reconciliationSyntaxCacheStats().oversized;
  let previousNode;
  for (const [name, run] of Object.entries(runGraph)) {
    const before = reconciliationParseStats().parsed, result = run(options);
    assert.equal(reconciliationParseStats().parsed - before, 1, name);
    const selected = records(result);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].selection.content, 'one');
    assert.deepEqual(result.read_set, [{ file: `${ID}.md`, sha256: hashBytes(fs.readFileSync(f.file)) }]);
    const native = scopedSelectionNodes(currentBody, selected[0].selection)[0];
    if (previousNode) assert.notEqual(native, previousNode, 'candidate and strict graphs own separate oversized syntax');
    previousNode = native;
    const start = currentBody.indexOf('one');
    assert.deepEqual(scopedGraphSelectionSpans(currentBody, null, selected[0].selection, true), [[start, start + 3]]);
    bounded();
  }
  assert.ok(reconciliationSyntaxCacheStats().oversized >= initialOversized + 2, 'the node-heavy tree must stay outside the retained cache');
});

test('#346 input syntax: raw input bullets keep inline code and exclude nested-bullet dependencies', (t) => {
  const body = '## Extracted Facts\n\n- Parent `exact code`.\n  - Child artifact:DOES-NOT-EXIST\n- Other fact.\n';
  const f = fixture(t, body), currentBody = f.body();
  for (const [name, run] of Object.entries(runGraph)) {
    const result = run(f.options()), selected = records(result);
    assert.equal(selected.length, 1, name);
    assert.equal(result.edges.length, 0, 'a selected parent input bullet does not acquire its nested child dependency');
    assert.match(selected[0].selection.content, /Parent `exact code`/);
    const spans = scopedGraphSelectionSpans(currentBody, null, selected[0].selection, true);
    assert.ok(spans.length > 0);
    assert.ok(spans.every(([start, end]) => !currentBody.slice(start, end).includes('DOES-NOT-EXIST')));
  }
});

test('#346 input syntax: graph reads reject current metadata and byte changes after source selection', (t) => {
  for (const [name, run] of Object.entries(runGraph)) for (const field of ['body', 'metadata', 'formatting']) {
    const f = fixture(t), options = f.options(), open = fs.openSync;
    let reads = 0, changed = false;
    const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
      if (file === f.file && ++reads === 2) {
        changed = true;
        if (field === 'body') f.write(smallBody.replace('One selected fact.', 'Different selected fact.'));
        else if (field === 'metadata') f.write(smallBody, { ...metadata, status: 'confirmed' });
        else fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('\n---\n\n', '\n\n---\n\n'));
      }
      return open.call(this, file, ...args);
    });
    try {
      assert.throws(() => run(options), /evidence differs from its indexed snapshot|input changed after anchor resolution/, `${name}: ${field}`);
      assert.equal(changed, true, 'the graph reads current bytes independently after the source resolver parsed them');
    } finally { hook.mock.restore(); }
  }
});

test('#346 input syntax: final byte audit and failed-anchor cleanup keep independent graph lifetimes', (t) => {
  const body = `${smallBody}\n~~~\n${'z'.repeat(reconciliationSyntaxCacheStats().max_source_chars)}\n~~~\n`;
  const f = fixture(t, body), source = createScopedSourceResolver(f.options());
  const before = reconciliationParseStats().parsed;
  assert.throws(() => source.evidence(`input:${ID}#missing/1`), /SW-SOURCE-ANCHOR/);
  assert.equal(reconciliationParseStats().parsed - before, 1);
  for (const [name, run] of Object.entries(runGraph)) {
    f.write(body);
    const initial = reconciliationParseStats().parsed;
    assert.throws(() => run(f.options(), (record) => {
      fs.appendFileSync(f.file, '\nLate change after selecting input.\n');
      return record;
    }), /evidence changed during graph resolution/, name);
    assert.equal(reconciliationParseStats().parsed - initial, 1, 'a failed anchor did not leave its syntax active');
    f.write(body);
    const again = reconciliationParseStats().parsed;
    assert.equal(run(f.options()).nodes.length, 1);
    assert.equal(reconciliationParseStats().parsed - again, 1, 'a failed graph did not leak its view into the next call');
    bounded();
  }
});
