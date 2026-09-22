import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { hashBytes } from './current-work-request.mjs';
import { scopeJson } from './scoped-work-normalize.mjs';
import { resolveScopedCoverageBasis, inspectScopedSourceCoverage } from './scoped-work-coverage.mjs';

const OWNER = 'screen:RESULT-001', INPUT = 'IN-20260917-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const effect = (id = '01', section = 'rules', bullet = '01') => [INPUT, id, 'compatible-fact', 'simple-update',
  'update', `artifact:DOC#${section}`, `input:${INPUT}#extracted-facts/${bullet}`, 'inherit', 'statement', 'inherit'];
const fields = ['inputId', 'item', 'basis', 'classification', 'effect', 'target', 'evidence', 'sourceRef', 'sourceUnit', 'capturedAt'];

// Real files and existing v2/owner/reference parsers. Synthetic review declarations
// below exercise byte integrity only and are not semantic or human approval.
function fixture(t, opts = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-coverage-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = new Map();
  const write = (name, fm, body) => {
    const file = path.join(root, name); fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const inputFile = path.join(root, `${INPUT}.md`);
  fs.writeFileSync(inputFile, md({ input_id: INPUT, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:coverage-fixture',
    captured_at: '2026-09-17T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'] },
  '## Extracted Facts\n- First actual fact.\n- Second actual fact.\n\n## Notes\nUnrelated input note.'));
  const docFile = write('contract.md', { artifact_id: 'DOC', artifact_type: 'business-rules', domain: 'result', status: 'draft' },
    '## Rules\nSelected rule.\n\n## Other\nOther rule.');
  const source = { input_id: INPUT, items: opts.selectedItems ?? ['01'], source_refs: opts.sourceRefs ?? [REF] };
  const ownerFile = write('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: 'src/features/result/screens/RESULT-001.tsx',
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: ['artifact:DOC#rules'], sources: [source] }] } },
  '## Notes\nOwner declaration, not permission.');
  const registerFile = path.join(root, 'register.md');
  const rows = opts.items ?? [effect(), effect('01', 'other'), effect('02', 'rules', '02')];
  fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', 'simple-update×2', opts.state ?? 'partially-reconciled',
      opts.result ?? 'pending', 'artifact:DOC', '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, rows)}`));
  const options = () => ({ owner: OWNER, unit: 'known', inputId: INPUT, projectRoot: root, registerFile,
    inputArtifacts: [loadInputArtifact(inputFile)], targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()]
      .map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const basis = () => resolveScopedCoverageBasis(options());
  const receipt = () => ({ ...basis().basis, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' });
  const run = (receipts = []) => inspectScopedSourceCoverage({ ...options(), receipts });
  return { root, docs, write, inputFile, docFile, ownerFile, registerFile, rows, options, basis, receipt, run };
}
const noPermit = (value) => {
  for (const field of ['ready', 'allowed', 'basis_digest', 'effective_binding']) assert.equal(Object.hasOwn(value, field), false);
  assert.equal(value.semantic_coverage_verified, false);
  assert.equal(value.origin_relation_verified, false);
  assert.equal(value.approval_verified, false);
};

test('D coverage: raw input, every selected effect field and canonical contract bytes form distinct hashes', (t) => {
  const f = fixture(t), out = f.basis();
  assert.equal(out.basis.input_sha256, hashBytes(fs.readFileSync(f.inputFile)));
  const effects = f.rows.filter((row) => row[1] === '01').map((row) => Object.fromEntries(fields.map((field, i) => [field, row[i]])))
    .sort((a, b) => Buffer.compare(Buffer.from(scopeJson(a)), Buffer.from(scopeJson(b))));
  assert.deepEqual(out.effects, effects);
  assert.equal(out.basis.effects_sha256, hashBytes(Buffer.from(scopeJson(effects))));
  const hashes = { 'contract.md': hashBytes(fs.readFileSync(f.docFile)) };
  assert.deepEqual(out.contract_hashes, hashes);
  assert.equal(out.basis.contracts_sha256, hashBytes(Buffer.from(scopeJson(hashes))));
  assert.equal(out.basis.owner, OWNER); assert.equal(out.basis.unit, 'known');
  for (const field of ['coverage', 'approval_ref', 'basis_digest']) assert.equal(Object.hasOwn(out.basis, field), false);
});

test('D coverage: current matching receipt is integrity evidence, not semantic approval or a permit', (t) => {
  const f = fixture(t), receipt = f.receipt(), copy = structuredClone(receipt), out = f.run([receipt]);
  assert.equal(out.receipt_state, 'current'); assert.deepEqual(out.receipt_mismatches, []);
  assert.equal(out.receipt_required, true); assert.equal(out.source_state_supported, true); noPermit(out);
  assert.deepEqual(receipt, copy);
});

for (const [state, result, required] of [['reconciled', 'accepted', false], ['reconciled', 'pending', true],
  ['partially-reconciled', 'accepted', true], ['partially-reconciled', 'pending', true]]) {
  test(`D coverage: ${state}/${result} retains its existing state and receipt requirement`, (t) => {
    const out = fixture(t, { state, result }).run();
    assert.equal(out.summary.reconcileStatus, state); assert.equal(out.summary.result, result);
    assert.equal(out.source_state_supported, true); assert.equal(out.receipt_required, required);
    assert.equal(out.receipt_state, 'missing'); noPermit(out);
  });
}

test('D coverage: in-progress and failed sources cannot become supported through a current receipt', (t) => {
  for (const state of ['in-progress', 'failed']) {
    const f = fixture(t, { state }), out = f.run([f.receipt()]);
    assert.equal(out.source_state_supported, false); noPermit(out);
  }
});

test('D coverage: changes outside the selected input anchor still invalidate the raw-input receipt hash', (t) => {
  const f = fixture(t), receipt = f.receipt(); fs.appendFileSync(f.inputFile, '\nUnrelated original-byte change.');
  const out = f.run([receipt]);
  assert.equal(out.receipt_state, 'stale'); assert.deepEqual(out.receipt_mismatches, ['input_sha256']); noPermit(out);
});

test('D coverage: raw contract changes outside a selected section invalidate receipt, not an R1 scope calculation', (t) => {
  const f = fixture(t), receipt = f.receipt(); fs.appendFileSync(f.docFile, '\nOther contract-byte change.');
  const out = f.run([receipt]); assert.deepEqual(out.receipt_mismatches, ['contracts_sha256']); noPermit(out);
});

test('D coverage: a non-first selected effect field changes the effect hash', (t) => {
  const f = fixture(t), receipt = f.receipt();
  const text = fs.readFileSync(f.registerFile, 'utf8').replace('artifact:DOC#other | ' + REF + ' | inherit | statement |',
    'artifact:DOC#other | ' + REF + ' | inherit | record |');
  fs.writeFileSync(f.registerFile, text);
  const out = f.run([receipt]); assert.deepEqual(out.receipt_mismatches, ['effects_sha256']); noPermit(out);
});

test('D coverage: an unselected Item effect changes audit bytes without changing the selected hashes', (t) => {
  const f = fixture(t), receipt = f.receipt(), before = f.basis();
  const ref = REF.replace('/01', '/02');
  fs.writeFileSync(f.registerFile, fs.readFileSync(f.registerFile, 'utf8').replace(`${ref} | inherit | statement |`, `${ref} | inherit | record |`));
  const out = f.run([receipt]); assert.equal(out.receipt_state, 'current');
  assert.notDeepEqual(out.read_set, before.read_set); noPermit(out);
});

test('D coverage: effect and declaration set order does not change hashes or mutate caller receipts', (t) => {
  const a = fixture(t, { selectedItems: ['01', '02'], sourceRefs: [REF, REF.replace('/01', '/02')] });
  const b = fixture(t, { selectedItems: ['02', '01'], sourceRefs: [REF.replace('/01', '/02'), REF],
    items: [effect('02', 'rules', '02'), effect('01', 'other'), effect()] });
  assert.deepEqual(a.basis().basis, b.basis().basis);
});

test('D coverage: owner, unit, source and exact selected Item/anchor sets cannot be borrowed', (t) => {
  const f = fixture(t), receipt = f.receipt();
  for (const patch of [{ owner: 'screen:OTHER-001' }, { unit: 'other' }]) {
    assert.equal(f.run([{ ...receipt, ...patch }]).receipt_state, 'missing');
  }
  for (const [field, value] of [['item_ids', ['02']], ['source_refs', [REF.replace('/01', '/02')]]]) {
    assert.deepEqual(f.run([{ ...receipt, [field]: value }]).receipt_mismatches, [field]);
  }
  assert.throws(() => resolveScopedCoverageBasis({ ...f.options(), unit: 'undeclared' }), /declared owner unit/);
  assert.throws(() => resolveScopedCoverageBasis({ ...f.options(), inputId: 'IN-20260917-meeting-002' }), /declared unit source/);
});

test('D coverage: duplicate or malformed receipts are not silently ignored', (t) => {
  const f = fixture(t), receipt = f.receipt();
  assert.throws(() => f.run([receipt, structuredClone(receipt)]), /duplicate/);
  for (const patch of [{ input_sha256: null }, { item_ids: ['1'] }, { coverage: 'accepted' }, { approved: true }]) {
    assert.throws(() => f.run([{ ...receipt, ...patch }]));
  }
});

test('D coverage: no-effect routing receipt is not positive implementation-source coverage', (t) => {
  const f = fixture(t), out = f.run([{ ...f.receipt(), origin_source_refs: [REF], origin_relation: 'no-effect-on-unit' }]);
  assert.equal(out.receipt_state, 'routing-only'); noPermit(out);
  const covered = f.run([{ ...f.receipt(), origin_source_refs: [], origin_relation: 'covered-for-unit' }]);
  assert.equal(covered.receipt_state, 'current'); noPermit(covered);
});

test('D coverage: recursive selected contract files are included but unreferenced files are excluded', (t) => {
  const f = fixture(t), extra = f.write('extra.md', { artifact_id: 'EXTRA', artifact_type: 'business-rules', domain: 'result', status: 'draft' },
    '## Other\nReferenced detail.');
  const unchanged = f.basis().basis; fs.appendFileSync(extra, '\nUnreferenced file change.');
  assert.deepEqual(f.basis().basis, unchanged);
  fs.writeFileSync(f.docFile, fs.readFileSync(f.docFile, 'utf8').replace('Selected rule.', 'See artifact:EXTRA#other'));
  const receipt = f.receipt(); assert.deepEqual(Object.keys(f.basis().contract_hashes).sort(), ['contract.md', 'extra.md']);
  fs.appendFileSync(extra, '\nNow a referenced file changed.');
  assert.deepEqual(f.run([receipt]).receipt_mismatches, ['contracts_sha256']);
});

test('D coverage: malformed v2 or unresolved contracts fail without writing canonical facts', (t) => {
  const f = fixture(t), files = [f.inputFile, f.docFile, f.ownerFile, f.registerFile];
  const before = files.map((file) => fs.readFileSync(file)); f.run([f.receipt()]);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
  fs.writeFileSync(f.registerFile, fs.readFileSync(f.registerFile, 'utf8').replace('"reconciliation_contract":2', '"reconciliation_contract":1'));
  assert.throws(() => f.run(), /SW-SOURCE-REGISTER/);
  const missing = fixture(t); fs.writeFileSync(missing.docFile, fs.readFileSync(missing.docFile, 'utf8').replace('Selected rule.', 'artifact:MISSING#rules'));
  assert.throws(() => missing.run(), /SW-REF-MISSING/);
});
