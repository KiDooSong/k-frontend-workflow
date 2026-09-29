import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { resolveScopedMappingEvidence } from './scoped-work-mapping.mjs';

const INPUT = 'IN-20260917-figma-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |',
  '|' + headers.map(() => '---').join('|') + '|', ...rows.map((row) => '| ' + row.join(' | ') + ' |')].join('\n');
const components = () => [
  ['`M-001` · first node', 'Panel', 'src/features/result/components/Panel.tsx', 'fixture'],
  ['`M-002` · second node', 'Other', 'src/features/result/components/Other.tsx', 'fixture'],
];
const provenance = () => [['M-001', 'inherit', 'node', 'inherit', REF],
  ['M-002', 'inherit', 'node', 'inherit', REF.replace('/01', '/02')]];

function fixture(t, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-mapping-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const screenId = opts.screenId ?? 'RESULT-001';
  const inputFile = path.join(root, `${INPUT}.md`);
  const inputFm = { input_id: INPUT, input_type: 'figma', source_type: 'figma',
    source_ref: opts.sourceRef ?? 'figma://file/fixture/node/1:1', captured_at: '2026-09-17T00:00:00Z',
    captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: [screenId] };
  fs.writeFileSync(inputFile, md(inputFm, '## Extracted Facts\n- First visible node.\n- Second visible node.'));
  const hostFile = path.join(root, 'host.md');
  const hostFm = { artifact_id: 'HOST', artifact_type: 'screen-spec', screen_id: screenId, domain: 'result', status: 'draft', ...opts.hostFm };
  fs.writeFileSync(hostFile, md(hostFm, '## UI Sections\nFixture host.'));
  const mappingFile = path.join(root, 'mapping.md');
  const mappingFm = { artifact_id: 'MAP', artifact_type: 'figma-component-mapping', screen_id: screenId, domain: 'result',
    status: 'draft', provenance_contract: 1, ...opts.mappingFm };
  const body = opts.mappingBody ?? `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, opts.components ?? components())}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, opts.provenance ?? provenance())}`;
  fs.writeFileSync(mappingFile, md(mappingFm, body));
  const docs = [{ file: hostFile, fm: hostFm }, { file: mappingFile, fm: mappingFm }];
  const inputArtifacts = [loadInputArtifact(inputFile)];
  const targetIndex = buildReconciliationTargetIndex({ docs });
  const args = { hostRef: 'artifact:HOST', mappingRef: 'artifact:MAP#component-mapping', mKeys: ['M-001'],
    projectRoot: root, inputArtifacts, targetIndex };
  return { root, inputFile, mappingFile, docs, args, resolve: (changes = {}) => resolveScopedMappingEvidence({ ...args, ...changes }) };
}

test('D mapping: selected M-key and matching provenance resolve actual host/input without a permit', (t) => {
  const f = fixture(t);
  const before = structuredClone(f.args.inputArtifacts);
  const out = f.resolve({ mKeys: ['M-002', 'M-001'] });
  assert.deepEqual(out.rows.map((row) => row.m_key), ['M-001', 'M-002']);
  assert.equal(out.host.screen_id, 'RESULT-001');
  assert.equal(out.mapping.metadata.screen_id, 'RESULT-001', 'never replace mapping screen_id with a surface_id');
  assert.equal(out.rows[0].component.cells[2], 'src/features/result/components/Panel.tsx');
  assert.equal(out.rows[0].provenance.cells[0], 'M-001');
  assert.equal(out.rows[0].anchor.content, 'First visible node.');
  assert.equal(out.rows[0].effective_source_ref, 'figma://file/fixture/node/1:1');
  assert.equal(out.rows[0].effective_captured_at, '2026-09-17T00:00:00Z');
  assert.deepEqual(f.args.inputArtifacts, before);
  for (const field of ['ready', 'allowed', 'basis_digest', 'all_hosts_allowed']) assert.equal(Object.hasOwn(out, field), false);
});

test('D mapping: empty/duplicate/missing keys and incorrect typed selector shapes are rejected', (t) => {
  const f = fixture(t);
  for (const mKeys of [[], ['M-001', 'M-001'], ['M-001', 'M-099'], ['M-1'], ['m-001'], [1]]) {
    assert.throws(() => f.resolve({ mKeys }));
  }
  for (const changes of [{ hostRef: 'artifact:HOST#ui-sections' }, { hostRef: 'artifact:MISSING' },
    { mappingRef: 'artifact:MAP' }, { mappingRef: 'artifact:MAP#component-mapping/M-001' },
    { mappingRef: 'artifact:MAP#notes' }]) assert.throws(() => f.resolve(changes));
  const keys = ['M-002', 'M-001'];
  assert.deepEqual(f.resolve({ mKeys: keys }), f.resolve({ mKeys: [...keys].reverse() }));
  assert.deepEqual(keys, ['M-002', 'M-001']);
});

test('D mapping: another host/domain/type and non-opted-in provenance cannot be borrowed', (t) => {
  for (const opts of [
    { mappingFm: { screen_id: 'RESULT-002' } }, { mappingFm: { domain: 'other' } },
    { mappingFm: { artifact_type: 'screen-spec' } }, { hostFm: { artifact_type: 'business-rules' } },
    { mappingFm: { provenance_contract: undefined } }, { mappingFm: { provenance_contract: 2 } },
  ]) assert.throws(() => fixture(t, opts).resolve());
  const f = fixture(t);
  const duplicate = buildReconciliationTargetIndex({ docs: [...f.docs, f.docs[1]] });
  assert.throws(() => f.resolve({ targetIndex: duplicate }), /SW-REF-AMBIGUOUS/);
});

test('D mapping: missing/broken provenance and selected out-of-range evidence are rejected', (t) => {
  for (const mutate of [
    (rows) => rows.pop(), (rows) => rows[0][0] = 'M-999',
    (rows) => rows[0][1] = 'figma://file/coarse', (rows) => rows[0][2] = 'document',
    (rows) => rows[0][3] = 'yesterday', (rows) => rows[0][4] = REF.replace('/01', '/99'),
    (rows) => rows[0][4] = REF.replace(INPUT, 'IN-20260917-figma-999'),
  ]) {
    const rows = provenance(); mutate(rows);
    assert.throws(() => fixture(t, { provenance: rows }).resolve());
  }
});

test('D mapping: malformed raw M-key, duplicate rows and fake/duplicate sections fail existing grammar', (t) => {
  for (const first of ['M-001 · node', '`M-1` · node', '**`M-001`** · node', '`M-001` · node M-002']) {
    const rows = components(); rows[0][0] = first;
    assert.throws(() => fixture(t, { components: rows }).resolve());
  }
  assert.throws(() => fixture(t, { components: [components()[0], components()[0]] }).resolve());
  const canonical = `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, components())}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, provenance())}`;
  assert.throws(() => fixture(t, { mappingBody: '```md\n' + canonical + '\n```' }).resolve());
  assert.throws(() => fixture(t, { mappingBody: canonical + '\n\n## Component Mapping\n' + table(COMPONENT_MAPPING_COLUMNS, components()) }).resolve());
});

test('D mapping: different host Figma nodes are retained, not voted or promoted to all-host authority', (t) => {
  const a = fixture(t).resolve();
  const b = fixture(t, { screenId: 'RESULT-002', sourceRef: 'figma://file/second/node/9:9' }).resolve();
  assert.notEqual(a.host.screen_id, b.host.screen_id);
  assert.notEqual(a.rows[0].effective_source_ref, b.rows[0].effective_source_ref);
  assert.equal(Object.hasOwn(b, 'allowed'), false);
});

test('D mapping: actual visual v2 Item target resolves its canonical M-key through source resolver', (t) => {
  const f = fixture(t);
  const registerFile = path.join(f.root, 'register.md');
  const fm = { reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' };
  const summary = [[INPUT, 'figma', 'simple-update', 'reconciled', 'accepted', 'artifact:MAP', '-', '-']];
  const items = [[INPUT, '01', 'visual-evidence', 'simple-update', 'update', 'artifact:MAP#component-mapping/M-001', REF, 'inherit', 'node', 'inherit']];
  fs.writeFileSync(registerFile, md(fm, `${table(REQUIRED_REGISTER_COLS, summary)}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, items)}`));
  const sources = createScopedSourceResolver({ ...f.args, registerFile });
  const out = sources.source({ input_id: INPUT, items: ['01'], source_refs: [REF] });
  assert.equal(out.groups[0].effects[0].target.selection.key, 'M-001');
  assert.equal(out.groups[0].effects[0].target.selection.cells[2], components()[0][2]);
  assert.equal(Object.hasOwn(out, 'ready'), false);
});

test('D mapping: indexed mapping changes fail; a fresh unselected row change leaves selected rows stable', (t) => {
  const f = fixture(t);
  const before = f.resolve();
  fs.writeFileSync(f.mappingFile, fs.readFileSync(f.mappingFile, 'utf8').replace('second node', 'changed second node'));
  assert.throws(() => f.resolve(), /SW-REF-SNAPSHOT/);
  const index = buildReconciliationTargetIndex({ docs: f.docs });
  assert.deepEqual(f.resolve({ targetIndex: index }).rows, before.rows);
});
