import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { resolveScopedCoverageBasis } from './scoped-work-coverage.mjs';
import { resolveScopedSourceRelations } from './scoped-work-source-relations.mjs';

const OWNER = 'screen:RESULT-001', INPUT = 'IN-20260922-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const effect = (item = '01', section = 'rules') => [INPUT, item, 'compatible-fact', 'simple-update',
  'update', `artifact:DOC#${section}`, `input:${INPUT}#extracted-facts/${item}`, 'inherit', 'statement', 'inherit'];
const select = (items = ['01']) => ({ input_id: INPUT, items, source_refs: items.map((id) => `input:${INPUT}#extracted-facts/${id}`) });

function fixture(t, { explicit = true, native = false, typed = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-relations-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = new Map(), inputs = new Map();
  const write = (name, fm, body, collection = docs) => {
    const file = path.join(root, name); fs.writeFileSync(file, md(fm, body)); collection.set(name, file); return file;
  };
  const change = (name, edit, collection = docs) => {
    const file = collection.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const value = { fm: before.data, body: before.body }; edit(value); fs.writeFileSync(file, md(value.fm, value.body));
  };
  const inputFile = write('input.md', { input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:relations',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] },
  '## Extracted Facts\n- Known first fact.\n- Other fact.\n\n## Notes\nUnrelated input prose.', inputs);
  const ownerFile = write('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: 'src/features/result/screens/Result.tsx', work_execution: { version: 1,
      units: [{ id: 'known', kind: 'behavior', contracts: ['artifact:DOC#rules'], sources: explicit ? [select()] : [] }] } },
  '## Notes\nAn authored unit is not permission.');
  const docFile = write('contract.md', { artifact_id: 'DOC', artifact_type: 'domain-rules', domain: 'result', status: 'draft',
    ...native ? { sources: [{ type: 'meeting', ref: INPUT }] } : {} },
  `## Rules\nKnown contract.${typed ? ` See ${REF}` : ''}\n\n## Other\nUnselected contract.`);
  const registerFile = path.join(root, 'register.md');
  const register = (rows = [effect(), effect('02', 'other')], status = 'partially-reconciled', result = 'pending') => {
    const touched = [...new Set(rows.filter((row) => row[4] === 'update').map((row) => row[5].split('#')[0]))].join(', ') || '-';
    const count = new Set(rows.map((row) => row[1])).size;
    fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', `simple-update×${count}`, status, result, touched, '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, rows)}`));
  };
  register();
  const options = () => ({ owner: OWNER, unit: 'known', projectRoot: root, registerFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    inputArtifacts: [...inputs.values()].map(loadInputArtifact), layout: loadLayoutProfile({ kitRoot: KIT_ROOT }) });
  return { root, docs, inputs, write, change, inputFile, ownerFile, docFile, registerFile, register, options,
    run: () => resolveScopedSourceRelations(options()) };
}
const noPermit = (value) => {
  for (const key of ['ready', 'allowed', 'approval_verified', 'semantic_coverage_verified', 'basis_digest']) assert.equal(Object.hasOwn(value, key), false);
};

test('D source relations: explicit selection matches the existing raw coverage basis without granting permission', (t) => {
  const f = fixture(t), out = f.run();
  assert.deepEqual(out.sources[0].basis, resolveScopedCoverageBasis({ ...f.options(), inputId: INPUT }).basis);
  assert.deepEqual(out.sources[0].issues, []); assert.equal(out.sources[0].connections.length, 1);
  assert.deepEqual(out.sources[0].source.reconciliation.summary.reconcileStatus, 'partially-reconciled');
  assert.deepEqual(out.pending_connections, []); noPermit(out);
});

test('D source relations: sources empty cannot erase a typed source in the selected canonical contract', (t) => {
  const f = fixture(t, { explicit: false, typed: true }), out = f.run();
  assert.deepEqual(out.sources[0].selection, select());
  assert.equal(out.sources[0].provenance[0].kind, 'contract-source');
  assert.deepEqual(out.sources[0].issues, []); noPermit(out);
});

test('D source relations: bare canonical input metadata infers only currently connected effect groups', (t) => {
  const f = fixture(t, { explicit: false, native: true }), out = f.run();
  assert.deepEqual(out.sources[0].selection, select());
  assert.equal(out.sources[0].provenance[0].kind, 'canonical-input');
  assert.deepEqual(out.pending_connections, []);
});

test('D source relations: declared and inferred selections are unioned, never first-winner or caller replacement', (t) => {
  const f = fixture(t, { typed: true });
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources = [select(['02'])]; fm.work_execution.units[0].contracts.push('artifact:DOC#other'); });
  const opts = f.options(), out = resolveScopedSourceRelations({ ...opts, sources: [], contracts: [], projection: { sources: [] } });
  assert.deepEqual(out.sources[0].selection, select(['01', '02']));
  assert.deepEqual(out.sources[0].issues, []);
});

test('D source relations: a typed input anchor with no selected target relation stays explicitly unconnected', (t) => {
  const f = fixture(t, { explicit: false, typed: true }); f.register([effect('01', 'other'), effect('02', 'other')]);
  const out = f.run(); assert.deepEqual(out.sources, []);
  assert.deepEqual(out.pending_connections, [{ input_id: INPUT, ref: REF, reason: 'source-effect-unconnected' }]); noPermit(out);
});

test('D source relations: explicit unrelated groups and mismatched anchors cannot masquerade as connected', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => fm.work_execution.units[0].sources = [select(['02'])]);
  const unrelated = f.run(); assert.ok(unrelated.sources[0].issues.some((entry) => entry.reason === 'source-effect-unconnected'));
  f.change('screen.md', ({ fm }) => fm.work_execution.units[0].sources = [{ ...select(), source_refs: select(['02']).source_refs }]);
  assert.ok(f.run().sources[0].issues.some((entry) => entry.reason === 'source-anchor-unconnected'));
});

test('D source relations: every selected group and every effect field is retained, including a non-first target', (t) => {
  const f = fixture(t); f.register([effect('01', 'other'), effect(), effect('02', 'other')]);
  const out = f.run(); assert.equal(out.sources[0].source.groups[0].effects.length, 2);
  assert.equal(out.sources[0].connections.length, 1); assert.deepEqual(out.sources[0].issues, []);
});

test('D source relations: a separate whole-body contract stays broad while sibling-only sections do not overlap', (t) => {
  const f = fixture(t, { explicit: false, native: true });
  assert.deepEqual(f.run().sources[0].selection.items, ['01']);
  f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts.push('artifact:DOC'));
  assert.deepEqual(f.run().sources[0].selection.items, ['01', '02']);
});

test('D source relations: source references inside unselected sections do not create effective input dependencies', (t) => {
  const f = fixture(t, { explicit: false });
  f.change('contract.md', (doc) => doc.body += `\n\n## Unselected\nSee ${REF}`);
  const out = f.run(); assert.deepEqual(out.sources, []); assert.deepEqual(out.pending_connections, []);
});

test('D source relations: nested input bullets are not owned by their parent anchor', (t) => {
  const f = fixture(t, { explicit: false, typed: true });
  f.change('input.md', (doc) => doc.body = '## Extracted Facts\n- Parent fact.\n  - Nested fact.\n- Later fact.', f.inputs);
  f.register([effect('01', 'other'), effect('02', 'rules')]);
  const out = f.run(); assert.deepEqual(out.sources, []); assert.equal(out.pending_connections.length, 1);
});

test('D source relations: canonical metadata input IDs must resolve and cannot be URL/name guesses', (t) => {
  const f = fixture(t, { explicit: false, native: true });
  f.change('contract.md', ({ fm }) => fm.sources[0].ref = 'IN-20260922-meeting-999');
  assert.throws(() => f.run(), /missing, ambiguous or invalid canonical input/);
  f.change('contract.md', ({ fm }) => fm.sources[0].ref = `https://example.invalid/${INPUT}`);
  assert.deepEqual(f.run().sources, []);
});

test('D source relations: changed input/contract bytes affect their own hashes; unrelated effect fields do not', (t) => {
  const f = fixture(t, { explicit: false, native: true }), before = f.run().sources[0].basis;
  const row = effect('02', 'other'); row[8] = 'record'; f.register([effect(), row]);
  assert.deepEqual(f.run().sources[0].basis, before);
  fs.appendFileSync(f.inputFile, '\nOriginal bytes changed.'); const input = f.run().sources[0].basis;
  assert.notEqual(input.input_sha256, before.input_sha256); assert.equal(input.effects_sha256, before.effects_sha256);
  fs.appendFileSync(f.docFile, '\nUnselected prose changed.'); const contract = f.run().sources[0].basis;
  assert.notEqual(contract.contracts_sha256, input.contracts_sha256);
});

test('D source relations: invalid v2 and missing effect targets fail rather than becoming a smaller selection', (t) => {
  const f = fixture(t, { explicit: false, typed: true });
  fs.writeFileSync(f.registerFile, fs.readFileSync(f.registerFile, 'utf8').replace('"reconciliation_contract":2', '"reconciliation_contract":1'));
  assert.throws(() => f.run(), /Reconciliation Contract v2/);
  const missing = fixture(t, { explicit: false, typed: true }), row = effect(); row[5] = 'artifact:MISSING#rules'; missing.register([row]);
  assert.throws(() => missing.run());
});

test('D source relations: selected API raw-row references participate, unselected API rows do not', (t) => {
  const f = fixture(t, { explicit: false });
  f.change('screen.md', (doc) => {
    doc.fm.work_execution.units[0].kind = 'api-contract';
    doc.fm.work_execution.units[0].api_candidates = [{ method: 'GET', path: '/results' }];
    doc.body = `## API Candidates\n${table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'], [
      ['GET', '/results', 'confirmed', 'active', '', 'src/api/results/**', REF],
      ['GET', '/other', 'confirmed', 'active', '', 'src/api/other/**', 'input:IN-20260922-meeting-999#extracted-facts/01'],
    ])}`;
  });
  assert.deepEqual(f.run().sources[0].selection, select());
});

test('D source relations: selected screen M-key consumes only its real matching provenance and Item group', (t) => {
  const f = fixture(t, { explicit: false });
  f.change('input.md', ({ fm }) => { fm.input_type = 'figma'; fm.source_type = 'figma'; fm.source_ref = 'figma://file/source-relations/node/1:1'; }, f.inputs);
  f.write('mapping.md', { artifact_id: 'MAP', artifact_type: 'figma-component-mapping', domain: 'result', screen_id: 'RESULT-001', status: 'draft', provenance_contract: 1 },
    `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [
      ['\`M-001\` · first', 'First', 'src/features/result/components/First.tsx', 'selected'],
      ['\`M-002\` · other', 'Other', 'src/features/result/components/Other.tsx', 'unselected'],
    ])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [
      ['M-001', 'inherit', 'node', 'inherit', REF], ['M-002', 'inherit', 'node', 'inherit', REF.replace('/01', '/02')],
    ])}`);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].kind = 'visual'; fm.work_execution.units[0].contracts = ['artifact:MAP#component-mapping/M-001']; });
  const rows = [effect(), effect('02')];
  for (const row of rows) { row[2] = 'visual-evidence'; row[5] = `artifact:MAP#component-mapping/M-0${row[1]}`; row[8] = 'node'; }
  f.register(rows);
  // The summary source is the canonical input type, not the filename token.
  fs.writeFileSync(f.registerFile, fs.readFileSync(f.registerFile, 'utf8').replace(`${INPUT} | meeting |`, `${INPUT} | figma |`));
  const out = f.run(); assert.deepEqual(out.sources[0].selection, select());
  assert.deepEqual(out.sources[0].issues, []);
  assert.ok(out.contracts.nodes.some((node) => node.ref === 'artifact:MAP#mapping-provenance/M-001'));
  assert.ok(!out.contracts.nodes.some((node) => node.ref.endsWith('/M-002')));
});

test('D source relations: stale indexed bytes and real mutation during register reading are rejected', (t) => {
  const f = fixture(t), opts = f.options(); fs.appendFileSync(f.docFile, '\nChanged after indexing.');
  assert.throws(() => resolveScopedSourceRelations(opts), /differs from/);
  const g = fixture(t), readFile = fs.readFileSync; let mutated = false;
  fs.readFileSync = function (file, ...args) {
    const out = readFile.call(this, file, ...args);
    if (!mutated && file === g.registerFile) { mutated = true; fs.appendFileSync(g.docFile, '\nChanged during inspection.'); }
    return out;
  };
  try { assert.throws(() => g.run(), /snapshot changed|differs from/); } finally { fs.readFileSync = readFile; }
  assert.equal(mutated, true);
});

test('D source relations: inspection and caller mutation never rewrite canonical records or future observations', (t) => {
  const f = fixture(t, { explicit: false, typed: true }); const files = [...f.docs.values(), ...f.inputs.values(), f.registerFile];
  const before = files.map((file) => fs.readFileSync(file)); const out = f.run();
  out.sources[0].selection.items.push('99'); out.sources[0].source.groups.length = 0;
  assert.deepEqual(f.run().sources[0].selection, select()); files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});
