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
import { inspectScopedInputCoverage } from './scoped-work-input-coverage.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';
import { hashBytes } from './current-work-request.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';
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
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-input-coverage-')));
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

function coverageFixture(t, config) {
  const f = fixture(t, config), kitRoot = path.join(f.root, '.kit'); fs.mkdirSync(kitRoot);
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  fs.writeFileSync(policyFile, JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));

  fs.writeFileSync(layoutFile, JSON.stringify({ roles: { screen: ['src/features/{domain}/screens/**'],
    domain_component: ['src/features/{domain}/components/**'], hook: ['src/features/{domain}/hooks/**'],
    api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } }));
  fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, artifacts: {} }));
  let origins = [{ input_id: INPUT, source_refs: [REF] }], reports = [];
  const baseOptions = f.options;
  f.options = () => ({ ...baseOptions(), docsDir: f.root, kitRoot, policyFile, layoutFile, manifestFile,
    origin_inputs: origins, coverage_reports: reports });
  f.inspect = (extra = {}) => inspectScopedInputCoverage({ ...f.options(), ...extra });
  f.origins = (value) => { origins = value; };
  f.proof = (selection = select(), extra = {}) => {
    const relations = resolveScopedSourceRelations(f.options());
    const source = createScopedSourceResolver(f.options()).source(selection);
    const hash = (value) => hashBytes(Buffer.from(scopeJson(value), 'utf8'));
    return { version: 1, owner: OWNER, unit: 'known', input_id: INPUT,
      item_ids: scopeSet(selection.items), source_refs: scopeSet(selection.source_refs), input_sha256: source.input.input_sha256,
      effects_sha256: hash(scopeSet(source.groups.flatMap((group) => group.effects.map((effect) => effect.fields)))),
      contracts_sha256: hash(relations.contract_hashes), review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit', ...extra };
  };
  f.report = (receipt, name = 'reviews/actual.md') => {
    const file = path.join(f.root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `# Existing Stage 04 review\n\n\`\`\`work-coverage\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n`);
    reports = [name]; return file;
  };
  return f;
}
const positive = (f) => { const receipt = f.proof(); f.report(receipt); return receipt; };
function routing(t) {
  const f = coverageFixture(t, { explicit: false });
  f.origins([{ input_id: INPUT, source_refs: select(['02']).source_refs }]);
  const proof = f.proof(select(['02']), { origin_source_refs: select(['02']).source_refs, origin_relation: 'no-effect-on-unit' });
  const file = f.report(proof); return { f, proof, file };
}
function pending(out) { assert.equal(out.coverage_satisfied, false); assert.equal(out.origin_inputs[0].accepted, false); }
function noApproval(out) { assert.equal(out.semantic_coverage_verified, false); assert.equal(out.approval_verified, false); assert.equal(Object.hasOwn(out, 'ready'), false); }

test('D input coverage: completed accepted typed reconciliation needs no extra receipt and retains exact origin', (t) => {
  const f = coverageFixture(t); f.register(undefined, 'reconciled', 'accepted'); const out = f.inspect();
  assert.equal(out.coverage_satisfied, true); assert.equal(out.sources[0].receipt_required, false);
  assert.equal(out.origin_inputs[0].accepted, true); assert.deepEqual(out.origin_inputs[0].source_refs, [REF]); noApproval(out);
});

test('D input coverage: partial/pending without review evidence stays unready', (t) => {
  const f = coverageFixture(t); const out = f.inspect(); pending(out);
  assert.equal(out.sources[0].receipt_state, 'missing'); assert.equal(out.sources[0].receipt_required, true);
});

for (const [state, result] of [['partially-reconciled', 'pending'], ['partially-reconciled', 'accepted'], ['reconciled', 'pending']]) {
  test(`D input coverage: ${state}/${result} accepts current file-backed unit coverage without approving the whole input`, (t) => {
    const f = coverageFixture(t); f.register(undefined, state, result); positive(f); const out = f.inspect();
    assert.equal(out.coverage_satisfied, true); assert.equal(out.sources[0].receipt_required, true);
    assert.equal(out.sources[0].source.reconciliation.summary.reconcileStatus, state);
    assert.deepEqual(out.sources[0].selection.items, ['01']); assert.equal(out.origin_inputs[0].accepted, true); noApproval(out);
  });
}

test('D input coverage: failed and in-progress source states cannot be upgraded by a current receipt', (t) => {
  for (const [state, result] of [['in-progress', 'pending'], ['failed', 'pending']]) {
    const f = coverageFixture(t); f.register(undefined, state, result); positive(f); pending(f.inspect());
  }
});

test('D input coverage: full-input origins stay full without requiring unrelated units to be implemented', (t) => {
  const f = coverageFixture(t); f.origins([{ input_id: INPUT, source_refs: [] }]); positive(f); const out = f.inspect();
  assert.equal(out.coverage_satisfied, true); assert.deepEqual(out.origin_inputs[0].source_refs, []);
  assert.equal(out.origin_inputs[0].raw_hash, hashBytes(fs.readFileSync(f.inputFile)));
  assert.deepEqual(out.sources[0].selection.items, ['01']);
});

test('D input coverage: sources empty and old canonical contracts cannot drop an unconnected new origin', (t) => {
  const f = coverageFixture(t, { explicit: false }); const out = f.inspect(); pending(out);
  assert.deepEqual(out.sources, []); assert.equal(out.origin_inputs[0].input_id, INPUT);
  assert.ok(out.denials.some((entry) => entry.code === 'origin-input-unreconciled'));
});

test('D input coverage: current inferred canonical connection is accepted with the same exact coverage selection', (t) => {
  const f = coverageFixture(t, { explicit: false, typed: true }); positive(f); const out = f.inspect();
  assert.equal(out.coverage_satisfied, true); assert.deepEqual(out.sources[0].selection, select());
});

test('D input coverage: an unexplained narrow origin needs its own explicit reviewed relation', (t) => {
  const f = coverageFixture(t); f.origins([{ input_id: INPUT, source_refs: select(['02']).source_refs }]); positive(f); pending(f.inspect());
  f.report(f.proof(select(), { origin_relation: 'covered-for-unit', origin_source_refs: select(['02']).source_refs }));
  assert.equal(f.inspect().coverage_satisfied, true);
});

test('D input coverage: covered-for-unit cannot replace a real source connection or borrow a different origin scope', (t) => {
  const f = coverageFixture(t, { explicit: false });
  f.report(f.proof(select(), { origin_relation: 'covered-for-unit', origin_source_refs: [REF] })); pending(f.inspect());
  const g = coverageFixture(t); g.report(g.proof(select(), { origin_relation: 'covered-for-unit', origin_source_refs: [] }));
  const out = g.inspect(); pending(out); assert.ok(out.origin_inputs[0].reasons.includes('origin-scope-mismatch'));
});

test('D input coverage: no-effect uses current unrelated routing effects, not positive implementation-source evidence', (t) => {
  const { f } = routing(t), out = f.inspect(); assert.equal(out.coverage_satisfied, true);
  assert.equal(out.origin_inputs[0].relation, 'no-effect-on-unit'); assert.deepEqual(out.sources, []);
  assert.equal(out.origin_inputs[0].routing.source.groups[0].effects[0].target.ref, 'artifact:DOC#other'); noApproval(out);
});

test('D input coverage: a no-effect label cannot hide a selected-contract effect or explicit source dependency', (t) => {
  const { f } = routing(t); f.register([effect(), effect('02', 'rules')]);
  f.report(f.proof(select(['02']), { origin_relation: 'no-effect-on-unit', origin_source_refs: select(['02']).source_refs }));
  const out = f.inspect(); pending(out); assert.ok(out.origin_inputs[0].reasons.includes('routing-affects-selected-contract'));
  const g = coverageFixture(t); g.report(g.proof(select(), { origin_relation: 'no-effect-on-unit', origin_source_refs: [REF] }));
  const explicit = g.inspect(); pending(explicit); assert.ok(explicit.origin_inputs[0].reasons.includes('origin-is-unit-source'));
});

test('D input coverage: unconnected native source dependencies and unresolved unit Unknowns defeat no-effect', (t) => {
  const { f } = routing(t);
  f.write('unknown.md', { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'result', status: 'draft' },
    `## Unknowns\\n${table(['ID', 'Question'], [['U-ONE', 'What remains unknown?']])}`.replaceAll('\\n', '\n'));
  const out = f.inspect(); pending(out); assert.ok(out.origin_inputs[0].reasons.includes('unit-uncertainty-unresolved'));
  const { f: g } = routing(t); g.change('contract.md', (doc) => doc.body = doc.body.replace('Known contract.', `Known contract. ${REF.replace('/01', '/02')}`));
  g.report(g.proof(select(['02']), { origin_relation: 'no-effect-on-unit', origin_source_refs: select(['02']).source_refs }));
  pending(g.inspect());
});

test('D input coverage: no-effect must preserve exact narrow/full origin scope and cannot borrow another unit receipt', (t) => {
  const { f, proof } = routing(t); f.report({ ...proof, origin_source_refs: [] }); pending(f.inspect());
  f.report({ ...proof, unit: 'other' }); pending(f.inspect());
  const full = routing(t); full.f.origins([{ input_id: INPUT, source_refs: [] }]); pending(full.f.inspect());
  full.f.report({ ...full.proof, origin_source_refs: [] });
  const out = full.f.inspect(); pending(out);
  assert.ok(out.origin_inputs[0].reasons.includes('routing-affects-selected-contract'));
  assert.deepEqual(out.origin_inputs[0].routing.origin_source.selection.items, ['01', '02']);
});

test('D input coverage: input/effect/contract hash changes reject previous partial review evidence', (t) => {
  for (const field of ['input_sha256', 'effects_sha256', 'contracts_sha256']) {
    const f = coverageFixture(t), proof = f.proof(); f.report({ ...proof, [field]: `sha256:${'0'.repeat(64)}` });
    const out = f.inspect(); pending(out); assert.ok(out.sources[0].receipt_mismatches.includes(field));
  }
  const { f } = routing(t); fs.appendFileSync(f.inputFile, '\nChanged original input.'); pending(f.inspect());
});

test('D input coverage: duplicate origins, missing input and foreign anchors fail instead of being removed', (t) => {
  const f = coverageFixture(t);
  for (const origins of [undefined, null, [{ input_id: INPUT, source_refs: [] }, { input_id: INPUT, source_refs: [] }],
    [{ input_id: 'IN-20260922-meeting-999', source_refs: [] }], [{ input_id: INPUT, source_refs: ['input:IN-20260922-meeting-999#extracted-facts/01'] }]]) {
    assert.throws(() => f.inspect({ origin_inputs: origins }));
  }
});

test('D input coverage: memory receipts and forged caller relation/projection cannot replace actual review files', (t) => {
  const f = coverageFixture(t); assert.throws(() => f.inspect({ receipts: [f.proof()] }), /in-memory/);
  pending(f.inspect({ origin_relations: [{ accepted: true }], ignored_inputs: [INPUT], projection: { sources: [] } }));
});

test('D input coverage: report bytes changing during canonical evaluation invalidate the pinned observation', (t) => {
  const f = coverageFixture(t), file = f.report(f.proof()), options = f.options(), original = fs.openSync;
  let changed = false;
  t.mock.method(fs, 'openSync', function (name, ...args) {
    const fd = original.call(this, name, ...args);
    if (!changed && name === f.ownerFile) { changed = true; fs.appendFileSync(file, '\nChanged during inspection.'); }
    return fd;
  });
  assert.throws(() => inspectScopedInputCoverage(options), /snapshot changed/);
  assert.equal(changed, true);
});

test('D input coverage: no-origin canonical work still checks sources, and inspection never writes or approves', (t) => {
  const f = coverageFixture(t); f.origins([]); assert.equal(f.inspect().coverage_satisfied, false);
  positive(f); const files = [...f.docs.values(), ...f.inputs.values(), f.registerFile], bytes = files.map((file) => fs.readFileSync(file));
  const out = f.inspect(); assert.equal(out.coverage_satisfied, true); assert.deepEqual(out.origin_inputs, []); noApproval(out);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), bytes[i]));
  const g = coverageFixture(t, { explicit: false }); g.origins([]); assert.equal(g.inspect().coverage_satisfied, true);
});


test('D origin routing: full input with genuinely unrelated current effects can use a reviewed routing subset', (t) => {
  const { f, proof } = routing(t); f.register([effect('01', 'other'), effect('02', 'other')]);
  f.origins([{ input_id: INPUT, source_refs: [] }]); f.report({ ...proof, origin_source_refs: [] });
  const out = f.inspect(); assert.equal(out.coverage_satisfied, true);
  assert.deepEqual(out.origin_inputs[0].routing.source.selection.items, ['02']);
  assert.deepEqual(out.origin_inputs[0].routing.origin_source.selection.items, ['01', '02']);
  assert.deepEqual(out.sources, []); noApproval(out);
});

test('D origin routing: a new unselected related effect defeats full-input no-effect without changing its selected receipt hash', (t) => {
  const { f, proof } = routing(t); f.register([effect('02', 'other')]);
  f.origins([{ input_id: INPUT, source_refs: [] }]); f.report({ ...proof, origin_source_refs: [] });
  const before = f.inspect(); assert.equal(before.coverage_satisfied, true);
  f.register([effect(), effect('02', 'other')]);
  const after = f.inspect(); pending(after);
  assert.deepEqual(after.origin_inputs[0].routing.basis, before.origin_inputs[0].routing.basis);
  assert.deepEqual(after.origin_inputs[0].routing.receipt_mismatches, []);
  assert.ok(after.origin_inputs[0].reasons.includes('routing-affects-selected-contract'));
});

test('D origin routing: a new unselected unrelated effect does not force receipt rewrite or prior work repetition', (t) => {
  const { f, proof } = routing(t); f.register([effect('02', 'other')]);
  f.origins([{ input_id: INPUT, source_refs: [] }]); f.report({ ...proof, origin_source_refs: [] });
  const before = f.inspect(); assert.equal(before.coverage_satisfied, true);
  f.register([effect('01', 'other'), effect('02', 'other')]);
  const after = f.inspect(); assert.equal(after.coverage_satisfied, true);
  assert.deepEqual(after.origin_inputs[0].routing.basis, before.origin_inputs[0].routing.basis);
  assert.deepEqual(after.origin_inputs[0].routing.origin_source.selection.items, ['01', '02']);
});

test('D origin routing: a narrow unrelated origin stays independent of a related effect outside its scope', (t) => {
  const { f } = routing(t), out = f.inspect(); assert.equal(out.coverage_satisfied, true);
  assert.deepEqual(out.origin_inputs[0].routing.origin_source.selection.items, ['02']);
  assert.ok(!out.origin_inputs[0].routing.graph.nodes.some((node) => node.ref === 'artifact:DOC#rules'));
});

test('D origin routing: all effects in an origin-selected Item are inspected, not only its first unrelated row', (t) => {
  const { f, proof } = routing(t); f.register([effect('01', 'other'), effect(), effect('02', 'other')]);
  f.origins([{ input_id: INPUT, source_refs: [REF] }]); f.report({ ...proof, origin_source_refs: [REF] });
  const out = f.inspect(); pending(out);
  assert.equal(out.origin_inputs[0].routing.origin_source.groups[0].effects.length, 2);
  assert.ok(out.origin_inputs[0].reasons.includes('routing-affects-selected-contract'));
});

test('D origin routing: a reviewed attachment for another source anchor cannot explain an origin with no effects', (t) => {
  const { f, proof } = routing(t); f.register([effect('02', 'other')]);
  f.origins([{ input_id: INPUT, source_refs: [REF] }]); f.report({ ...proof, origin_source_refs: [REF] });
  const out = f.inspect(); pending(out);
  assert.equal(out.origin_inputs[0].routing.origin_source, null);
  assert.ok(out.origin_inputs[0].reasons.includes('origin-effect-unconnected'));
});
