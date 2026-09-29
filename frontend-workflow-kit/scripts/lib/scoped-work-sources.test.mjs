import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { hashBytes } from './current-work-request.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';

const INPUT = 'IN-20260917-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const selection = (items = ['01']) => ({ input_id: INPUT, items, source_refs: [REF] });
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |',
  '|' + headers.map(() => '---').join('|') + '|', ...rows.map((row) => '| ' + row.join(' | ') + ' |')].join('\n');
const effect = (item = '01', section = 'rules', bullet = '01') => [INPUT, item, 'compatible-fact', 'simple-update',
  'update', `artifact:DOC#${section}`, `input:${INPUT}#extracted-facts/${bullet}`, 'inherit', 'statement', 'inherit'];

// Real files and existing register/input/typed-index parsers. Synthetic content,
// not user acceptance, human scope approval or a permitted implementation.
function fixture(t, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-sources-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputFile = path.join(root, `${INPUT}.md`);
  const inputFm = { input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:scope-fixture',
    captured_at: '2026-09-17T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'], ...opts.inputFm };
  fs.writeFileSync(inputFile, md(inputFm, opts.inputBody ?? '## Extracted Facts\n- First actual fact.\n- Second actual fact.\n\n## Notes\nUnrelated note.'));
  const docFile = path.join(root, 'contract.md');
  const fm = { artifact_id: 'DOC', artifact_type: 'business-rules', domain: 'result', status: 'draft' };
  fs.writeFileSync(docFile, md(fm, opts.contractBody ?? '## Rules\nSelected rule.\n\n## Other\nOther rule.'));
  const targetIndex = buildReconciliationTargetIndex({ docs: [{ file: docFile, fm }] });
  const registerFile = path.join(root, 'register.md');
  const summaries = [[INPUT, 'meeting', opts.classification ?? 'simple-update×2', opts.state ?? 'partially-reconciled',
    opts.result ?? 'pending', 'artifact:DOC', '-', '-']];
  const items = opts.items ?? [effect('01'), effect('01', 'other'), effect('02', 'rules', '02')];
  fs.writeFileSync(registerFile, md(opts.registerFm ?? { reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, items)}`));
  const inputArtifacts = [loadInputArtifact(inputFile)];
  const options = { projectRoot: root, targetIndex, registerFile, inputArtifacts };
  return { root, inputFile, docFile, registerFile, inputArtifacts, options,
    resolver: createScopedSourceResolver(options) };
}

test('D sources: resolve actual selected anchor and every effect in its Item group without a permit', (t) => {
  const f = fixture(t);
  const before = structuredClone(f.inputArtifacts);
  const out = f.resolver.source(selection());
  assert.equal(out.anchors[0].content, 'First actual fact.');
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].effects.length, 2, 'whole Item group, not the first matching effect');
  assert.deepEqual(out.groups[0].effects.map((entry) => entry.target.selection.section).sort(), ['other', 'rules']);
  assert.equal(out.groups[0].effects[0].fields.item, '01');
  assert.equal(out.groups[0].effects[0].evidence.ref, REF);
  assert.equal(out.input.input_sha256, hashBytes(fs.readFileSync(f.inputFile)));
  assert.equal(out.reconciliation.summary.reconcileStatus, 'partially-reconciled');
  assert.equal(out.reconciliation.summary.result, 'pending');
  for (const field of ['ready', 'allowed', 'basis_digest', 'approval_ref', 'coverage']) assert.equal(Object.hasOwn(out, field), false);
  assert.deepEqual(f.inputArtifacts, before);
});

test('D sources: Item/anchor set order is stable and never mutates the selection', (t) => {
  const f = fixture(t);
  const value = { ...selection(['02', '01']), source_refs: [REF.replace('/01', '/02'), REF] };
  const before = structuredClone(value);
  const a = f.resolver.source(value);
  const b = f.resolver.source({ ...value, items: [...value.items].reverse(), source_refs: [...value.source_refs].reverse() });
  assert.deepEqual(a, b);
  assert.deepEqual(value, before);
  a.input.metadata.status = 'confirmed';
  assert.equal(f.resolver.source(value).input.metadata.status, 'captured');
  assert.throws(() => f.resolver.sources([selection(), selection(['02'])]), /duplicate input selection/);
});

test('D sources: missing/duplicate input and missing Item cannot be hidden by valid selectors', (t) => {
  const f = fixture(t);
  assert.throws(() => f.resolver.source({ ...selection(), input_id: INPUT.replace('001', '002'),
    source_refs: [REF.replace('001', '002')] }), /SW-SOURCE-INPUT/);
  const duplicate = createScopedSourceResolver({ ...f.options, inputArtifacts: [...f.inputArtifacts, f.inputArtifacts[0]] });
  assert.throws(() => duplicate.source(selection()), /ambiguous/);
  assert.throws(() => f.resolver.source(selection(['01', '03'])), /nonempty array required/);
  for (const invalid of ['1', '001', 'not-an-item', 1, null]) {
    assert.throws(() => f.resolver.source(selection(['01', invalid])), /exactly two digits/);
  }
  assert.throws(() => f.resolver.source(selection(['01', '01'])), /duplicate selector/);
});

test('D sources: unique real input sections and nonempty, in-range anchors are mandatory', (t) => {
  for (const inputBody of ['## Extracted Facts\n- one\n\n## Extracted Facts\n- two',
    '```md\n## Extracted Facts\n- fake\n```', '## Extracted Facts\n- `code only`']) {
    assert.throws(() => fixture(t, { inputBody }).resolver.source(selection()), /SW-SOURCE-ANCHOR/);
  }
  const f = fixture(t);
  for (const source_refs of [[], [REF.replace('/01', '/99')], [REF.replace('extracted-facts', 'absent')], [REF, REF.replace('/01', '/1')]]) {
    assert.throws(() => f.resolver.source({ ...selection(), source_refs }));
  }
  const whole = f.resolver.source({ ...selection(), source_refs: [REF.replace('/01', '')] });
  assert.match(whole.anchors[0].content, /First actual fact/);
  assert.match(whole.anchors[0].content, /Second actual fact/);
  assert.equal(whole.anchors[0].bullet_index, null);
});

test('D sources: existing v2 hard routing, projection, evidence and provenance checks are executed', (t) => {
  for (const opts of [
    { registerFm: {} },
    { classification: 'simple-update' },
    { items: [effect(), effect(), effect('02', 'rules', '02')] },
    { items: [[...effect().slice(0, 4), 'resolve', ...effect().slice(5)], effect('02', 'rules', '02')] },
    { inputFm: { captured_at: 'not-a-timestamp' } },
    { contractBody: '## Missing\nNo selected section.' },
    { items: [[...effect().slice(0, 6), REF.replace(INPUT, INPUT.replace('001', '999')), 'inherit', 'statement', 'inherit'], effect('02', 'rules', '02')] },
  ]) assert.throws(() => fixture(t, opts).resolver.source(selection()), /SW-SOURCE-/);
});

test('D sources: raw Item tokens and raw table width cannot be normalized into accepted evidence', (t) => {
  for (const id of ['**01**', '[01](https://example.invalid)', '0<!--x-->1']) {
    assert.throws(() => fixture(t, { items: [effect(id), effect('02', 'rules', '02')] }).resolver.source(selection()), /SW-SOURCE-/);
  }
  const short = effect(); short.pop();
  const wide = [...effect(), 'extra'];
  for (const row of [short, wide]) assert.throws(() => fixture(t, { items: [row, effect('02', 'rules', '02')] }).resolver.source(selection()));
});

test('D sources: current raw-input hash is separate from selected evidence content', (t) => {
  const f = fixture(t);
  const before = f.resolver.source(selection());
  fs.appendFileSync(f.inputFile, '\nUnrelated note update.');
  const after = createScopedSourceResolver(f.options).source(selection());
  assert.notEqual(after.input.input_sha256, before.input.input_sha256);
  assert.deepEqual(after.anchors, before.anchors);
  assert.deepEqual(after.groups, before.groups);
  assert.equal(Object.hasOwn(after, 'basis_digest'), false, 'do not mislabel raw-input hash as human scope basis');
});

test('D sources: stale indexed metadata and noncanonical snapshot paths fail before use', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.inputFile, fs.readFileSync(f.inputFile, 'utf8').replace('"status":"captured"', '"status":"confirmed"'));
  assert.throws(() => f.resolver.source(selection()), /SW-SOURCE-SNAPSHOT/);
  const other = fixture(t);
  for (const file of [`${other.root}/x/../${INPUT}.md`, path.join(other.root, '..', `${INPUT}.md`), `${INPUT}.md`]) {
    const artifacts = [{ ...other.inputArtifacts[0], file }];
    assert.throws(() => createScopedSourceResolver({ ...other.options, inputArtifacts: artifacts }).source(selection()));
  }
});
