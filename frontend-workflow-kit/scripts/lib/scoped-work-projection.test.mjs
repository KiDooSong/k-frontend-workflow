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
import { scopeJson } from './scoped-work-normalize.mjs';
import { resolveScopedUnitProjection } from './scoped-work-projection.mjs';

const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const OWNER = 'screen:RESULT-001';
const INPUT = 'IN-20260918-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const unit = (id = 'known', contracts = ['artifact:DOC#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const policy = (owners = [OWNER]) => ({ work_execution: { version: 1, owners, profiles: ['visual', 'api-contract', 'behavior'],
  role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
    behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: ['src/private/**'] } });
const inputFm = (id = INPUT) => ({ input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:projection',
  captured_at: '2026-09-18T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] });

// Real files and the installed canonical parsers. This exercises a partial
// projection, not a replacement model for permission, coverage or human review.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = new Map();
  const inputs = new Map();
  const write = (name, fm, body, collection = docs) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, md(fm, body));
    collection.set(name, file);
    return file;
  };
  const change = (name, update, collection = docs) => {
    const file = collection.get(name);
    const parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const next = { fm: parsed.data, body: parsed.body };
    update(next);
    fs.writeFileSync(file, md(next.fm, next.body));
  };
  const policyFile = path.join(root, 'policy.yaml');
  fs.writeFileSync(policyFile, JSON.stringify(policy()));
  const setPolicy = (value) => fs.writeFileSync(policyFile, JSON.stringify(value));
  write('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: 'src/features/result/screens/Result.tsx',
    work_execution: { version: 1, private_paths: { hook: ['src/features/result/hooks/local/**'] },
      test_paths: ['src/features/result/tests/local/**'], units: [unit()] } }, '## Notes\nUnselected screen notes.');
  write('contract.md', { artifact_id: 'DOC', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Details\nKnown detail.\n\n## Notes\nHousekeeping.');
  const options = (owner = OWNER) => ({ owner, policyFile, projectRoot: root, layout,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file,
      fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    inputArtifacts: [...inputs.values()].map(loadInputArtifact), registerFile: path.join(root, 'register.md') });
  return { root, docs, inputs, write, change, setPolicy, options,
    run: (owner = OWNER) => resolveScopedUnitProjection(options(owner)) };
}
function withSource(f) {
  f.write('input.md', inputFm(), '## Extracted Facts\n- Retry up to `3` times.\n- Unselected fact.\n\n## Notes\nUnrelated.', f.inputs);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources = [{ input_id: INPUT, items: ['01'], source_refs: [REF] }]; });
  const items = (target = 'artifact:DOC#rules') => [
    [INPUT, '01', 'compatible-fact', 'simple-update', 'update', target, REF, 'inherit', 'statement', 'inherit'],
    [INPUT, '02', 'compatible-fact', 'simple-update', 'update', 'artifact:DOC#details', REF.replace('/01', '/02'), 'inherit', 'statement', 'inherit'],
  ];
  const register = (rows = items()) => fs.writeFileSync(path.join(f.root, 'register.md'), md({ reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', 'simple-update×2', 'partially-reconciled', 'pending', 'artifact:DOC', '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, rows)}`));
  register();
  return { items, register };
}
const apiHeaders = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const apiRow = (endpoint = '/results', note = 'selected') => ['GET', endpoint, 'confirmed', 'active', '', `src/api${endpoint}/**`, note];
function withApi(f) {
  const rows = [apiRow(), apiRow('/later', 'unselected')];
  const body = (values = rows) => `## API Candidates\n${table(apiHeaders, values)}\n\n## Notes\nUnselected.`;
  f.change('screen.md', (doc) => {
    doc.fm.work_execution.units = [{ ...unit('client'), kind: 'api-contract', api_candidates: [{ method: 'GET', path: '/results' }] }];
    doc.body = body();
  });
  return { rows, body };
}
function withSurface(f, { legacy = false } = {}) {
  const surface = 'surface:RESULT-PANEL';
  f.setPolicy(policy([surface, OWNER, ...legacy ? [] : ['screen:RESULT-002']]));
  const hosts = {};
  const visual = {};
  for (const [number, name] of [[1, 'screen.md'], [2, 'second.md']]) {
    const id = `RESULT-00${number}`;
    const mapping = `MAP-${number}`;
    const input = `IN-20260918-figma-00${number}`;
    const evidence = `input:${input}#extracted-facts/01`;
    const hostUnit = { ...unit('layout', [`artifact:${mapping}#component-mapping`]), kind: 'visual' };
    const fm = { artifact_id: `HOST-${number}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', status: 'draft' };
    if (!legacy || number === 1) fm.work_execution = { version: 1, units: [hostUnit, unit('unrelated')] };
    f.write(name, fm, '## Notes\nHost housekeeping.');
    f.write(`figma-${number}.md`, { ...inputFm(input), input_type: 'figma', source_type: 'figma',
      source_ref: `figma://file/fixture${number}/node/${number}:1`, affected_screens: [id] },
    '## Extracted Facts\n- Selected panel.\n- Other panel.', f.inputs);
    f.write(`mapping-${number}.md`, { artifact_id: mapping, artifact_type: 'figma-component-mapping', screen_id: id,
      domain: 'result', status: 'draft', provenance_contract: 1 },
    `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [
      ['`M-001` · panel node', 'Panel', 'src/features/result/components/panel/Panel.tsx', 'shared'],
      ['`M-002` · other node', 'Other', 'src/features/result/components/panel/Other.tsx', 'other'],
    ])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [
      ['M-001', 'inherit', 'node', 'inherit', evidence], ['M-002', 'inherit', 'node', 'inherit', evidence.replace('/01', '/02')],
    ])}`);
    hosts[id] = legacy && number === 2 ? 'legacy-current' : 'layout';
    visual[id] = { mapping_ref: `artifact:${mapping}#component-mapping`, m_keys: ['M-001'] };
  }
  f.write('surface.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec', surface_id: 'RESULT-PANEL',
    domain: 'result', status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'],
    implementation_paths: ['src/features/result/components/panel/**'], work_execution: { version: 1,
      units: [{ ...unit('panel'), kind: 'visual', host_units: hosts, host_visual_evidence: visual }] } }, '## Notes\nSurface notes.');
  return surface;
}

test('D projection: all owner units and selected recursive evidence are included without issuing a digest or permit', (t) => {
  const f = fixture(t);
  f.change('screen.md', ({ fm }) => fm.work_execution.units.push(unit('second', ['artifact:DOC#details'])));
  f.change('contract.md', (doc) => doc.body = doc.body.replace('Known contract.', 'See artifact:EXTRA#terms'));
  f.write('extra.md', { artifact_id: 'EXTRA', artifact_type: 'domain-rules', status: 'confirmed', domain: 'result' },
    '## Terms\nSee artifact:DOC#rules');
  const opts = f.options();
  const before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = resolveScopedUnitProjection(opts);
  assert.deepEqual(out.projection.known_units, ['known', 'second']);
  assert.equal(out.projection.units.length, 2);
  assert.equal(out.projection.evidence.nodes.length, 3);
  assert.equal(out.projection.evidence.edges.length, 2, 'finite real contract cycle');
  assert.equal(out.projection.owners[0].metadata.status, 'draft');
  for (const key of ['basis_digest', 'basis_version', 'ready', 'allowed', 'approval_ref', 'coverage']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
  out.projection.units[0].declaration.contracts.push('artifact:BAD');
  assert.equal(resolveScopedUnitProjection(opts).projection.units.length, 2);
});

test('D projection: housekeeping, unreferenced sections and binding self-fields stay outside selected projection', (t) => {
  const f = fixture(t);
  const before = f.run();
  f.change('contract.md', (doc) => { doc.fm.last_reviewed = '2026-09-19'; doc.body = doc.body.replace('Housekeeping.', 'Different notes.'); });
  f.change('screen.md', (doc) => { doc.fm.decision_work_scopes = { version: 1, bindings: [] }; doc.body += '\nMore notes.'; });
  const after = f.run();
  assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
  f.change('contract.md', ({ fm }) => fm.approval_source = { type: 'review', ref: 'review:changed-scope' });
  assert.notDeepEqual(f.run().projection, before.projection, 'referenced canonical approval scope is retained');
});

test('D projection: explicit broad contracts remain broad and selected text/ordered cells are not treated as sets', (t) => {
  const f = fixture(t);
  f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts.push('artifact:DOC'));
  const before = f.run();
  f.change('contract.md', (doc) => doc.body = doc.body.replace('Housekeeping.', 'Changed broad dependency.'));
  assert.notDeepEqual(f.run().projection, before.projection);
  f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts = ['artifact:DOC#rows/01']);
  f.change('contract.md', (doc) => doc.body = `## Rows\n${table(['ID', 'First', 'Second'], [['01', 'a', 'b']])}`);
  const ordered = f.run();
  f.change('contract.md', (doc) => doc.body = doc.body.replace('| a | b |', '| b | a |'));
  assert.notDeepEqual(f.run().projection, ordered.projection);
});

test('D projection: selector, unit, metadata and path-set order changes do not change normalized projection', (t) => {
  const f = fixture(t);
  f.change('screen.md', ({ fm }) => {
    fm.work_execution.units.push(unit('second', ['artifact:DOC#details', 'artifact:DOC#rules']));
    fm.work_execution.test_paths.push('src/features/result/tests/second/**');
  });
  const before = f.run();
  f.change('screen.md', ({ fm }) => {
    fm.work_execution.units.reverse(); fm.work_execution.test_paths.reverse(); fm.work_execution.units[0].contracts.reverse();
  });
  const p = policy(); p.work_execution.profiles.reverse(); p.work_execution.role_limits.behavior.reverse(); f.setPolicy(p);
  const after = f.run();
  assert.equal(scopeJson(after.projection), scopeJson(before.projection));
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D projection: actual entry, declared ownership roots, role ceilings and explicit denies are retained', (t) => {
  for (const update of [
    (f) => f.change('screen.md', ({ fm }) => fm.screen_entry = 'src/features/result/screens/Other.tsx'),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.private_paths.hook.push('src/features/result/hooks/extra/**')),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.test_paths.push('src/features/result/tests/extra/**')),
    (f) => { const p = policy(); p.work_execution.role_limits.behavior.pop(); f.setPolicy(p); },
    (f) => { const p = policy(); p.work_execution.deny_paths.push('src/other/**'); f.setPolicy(p); },
  ]) {
    const f = fixture(t); const before = f.run(); update(f);
    assert.notDeepEqual(f.run().projection, before.projection);
  }
});

test('D projection: selected input inline-code values change projection while unselected bullet changes only audit', (t) => {
  for (const eol of ['\n', '\r\n', '\r']) {
    const f = fixture(t); withSource(f);
    const file = f.inputs.get('input.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, eol));
    const before = f.run();
    assert.match(scopeJson(before.projection), /Retry up to `3` times/);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Unselected fact.', 'Changed other fact.'));
    const unrelated = f.run();
    assert.deepEqual(unrelated.projection, before.projection);
    assert.notDeepEqual(unrelated.read_set, before.read_set);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('`3`', '`10`'));
    assert.notDeepEqual(f.run().projection, before.projection);
  }
});

test('D projection: source Item/anchor selection and every selected effect are part of the projection', (t) => {
  const f = fixture(t); const source = withSource(f); const before = f.run();
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources[0] = { input_id: INPUT, items: ['02'], source_refs: [REF.replace('/01', '/02')] }; });
  assert.notDeepEqual(f.run().projection, before.projection);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources[0] = { input_id: INPUT, items: ['01'], source_refs: [REF] }; });
  const rows = source.items(); rows.splice(1, 0, [...rows[0]]); rows[1][5] = 'artifact:DOC#details'; source.register(rows);
  const group = f.run();
  assert.equal(group.projection.units[0].sources[0].groups[0].effects.length, 2);
  assert.notDeepEqual(group.projection, before.projection);
});

test('D projection: unselected valid Item changes do not contaminate selected effect projection', (t) => {
  const f = fixture(t); const source = withSource(f); const before = f.run();
  const rows = source.items(); rows[1][5] = 'artifact:DOC#notes'; source.register(rows);
  const after = f.run();
  assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D projection: selected endpoint and full raw candidate row change projection, unselected API rows do not', (t) => {
  const f = fixture(t); const api = withApi(f); const before = f.run();
  const rows = structuredClone(api.rows); rows[1][6] = 'changed unselected note';
  f.change('screen.md', (doc) => doc.body = api.body(rows));
  assert.deepEqual(f.run().projection, before.projection);
  rows.reverse(); f.change('screen.md', (doc) => doc.body = api.body(rows));
  assert.deepEqual(f.run().projection, before.projection, 'analyzer row index is not scope');
  rows.find((row) => row[1] === '/results')[6] = 'changed selected note';
  f.change('screen.md', (doc) => doc.body = api.body(rows));
  assert.notDeepEqual(f.run().projection, before.projection);
  f.change('screen.md', ({ fm }) => fm.work_execution.units[0].api_candidates = [{ method: 'GET', path: '/later' }]);
  assert.notDeepEqual(f.run().projection, before.projection);
});

test('D projection: source inherited fidelity metadata is resolved without including unrelated ancestor prose', (t) => {
  const f = fixture(t);
  const parent = 'IN-20260918-meeting-002';
  f.write('parent.md', { ...inputFm(parent), input_contract: 2, raw_artifacts: ['capture.txt'],
    fidelity: { extraction: 'direct-text', verification: 'verified', verified_against: 'raw_artifact:capture.txt', unreadable_count: 0 } },
  '## Extracted Facts\n- Parent detail.', f.inputs);
  f.write('child.md', { ...inputFm(), input_contract: 2, fidelity: { extraction: 'inherited', verification: 'inherited',
    verified_against: `input:${parent}`, unreadable_count: 0 } }, '## Extracted Facts\n- Child fact.', f.inputs);
  f.change('contract.md', (doc) => doc.body = `## Rules\nSee ${REF}`);
  const before = f.run();
  assert.equal(before.projection.inputs.length, 2);
  assert.ok(before.read_set.some((entry) => entry.file === 'parent.md'));
  f.change('parent.md', (doc) => doc.body += '\nUnrelated source prose.', f.inputs);
  assert.deepEqual(f.run().projection, before.projection);
  f.change('parent.md', ({ fm }) => fm.source_ref = 'meeting:new-location', f.inputs);
  assert.notDeepEqual(f.run().projection, before.projection);
});

test('D projection: unresolved or invalid inherited fidelity cannot be dropped from selected metadata', (t) => {
  const f = fixture(t);
  f.write('child.md', { ...inputFm(), input_contract: 2, fidelity: { extraction: 'inherited', verification: 'inherited',
    verified_against: 'input:IN-20260918-meeting-999', unreadable_count: 0 } }, '## Extracted Facts\n- Child fact.', f.inputs);
  f.change('contract.md', (doc) => doc.body = `## Rules\nSee ${REF}`);
  assert.throws(() => f.run(), /invalid selected input metadata/);
});

test('D projection: surface collects both scoped host selections with distinct real Figma provenance', (t) => {
  const f = fixture(t); const surface = withSurface(f); const before = f.run(surface);
  assert.equal(before.projection.units.length, 3, 'surface plus referenced host units, not unrelated host units');
  assert.equal(before.projection.host_links.length, 2);
  const refs = before.projection.host_links.map((link) => link.mapping.rows[0].effective_source_ref);
  assert.equal(new Set(refs).size, 2, 'different host Figma nodes remain valid');
  f.change('second.md', ({ fm }) => fm.work_execution.units.find((u) => u.id === 'unrelated').contracts = ['artifact:DOC#details']);
  assert.deepEqual(f.run(surface).projection, before.projection);
  f.change('second.md', ({ fm }) => fm.work_execution.units.find((u) => u.id === 'layout').contracts.push('artifact:DOC#details'));
  assert.notDeepEqual(f.run(surface).projection, before.projection, 'same host unit ID with changed scope is not stable');
});

test('D projection: selected M-key/provenance changes are retained and separate broad contracts are never discarded', (t) => {
  const f = fixture(t); const surface = withSurface(f); const before = f.run(surface);
  f.change('surface.md', ({ fm }) => fm.work_execution.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-002']);
  assert.notDeepEqual(f.run(surface).projection, before.projection);
  f.change('surface.md', ({ fm }) => fm.work_execution.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-001']);
  f.change('mapping-2.md', (doc) => doc.body = doc.body.replace('other node', 'changed unselected node'));
  assert.notDeepEqual(f.run(surface).projection, before.projection, 'host contract selects whole component-mapping section');
});

test('D projection: legacy-current host has mapping evidence but no fabricated unit or path grant', (t) => {
  const f = fixture(t); const surface = withSurface(f, { legacy: true }); const before = f.run(surface);
  assert.equal(before.projection.units.length, 2);
  const host = before.projection.host_links.find((link) => link.member === 'screen:RESULT-002');
  assert.equal(host.host_unit, 'legacy-current');
  assert.equal(Object.hasOwn(host, 'allowed'), false);
  f.change('mapping-2.md', (doc) => doc.body = doc.body.replace('other node', 'changed unselected node'));
  assert.deepEqual(f.run(surface).projection, before.projection, 'no separate broad contract exists on legacy host');
  f.change('mapping-2.md', (doc) => doc.body = doc.body.replace('panel node', 'changed selected panel node'));
  assert.notDeepEqual(f.run(surface).projection, before.projection);
});

test('D projection: member/key/domain/unit/kind and host mapping mismatches fail without selecting another host', (t) => {
  for (const update of [
    (f) => f.change('surface.md', ({ fm }) => fm.member_screens.push('RESULT-003')),
    (f) => f.change('second.md', ({ fm }) => fm.domain = 'other'),
    (f) => f.change('surface.md', ({ fm }) => fm.work_execution.units[0].host_units['RESULT-002'] = 'absent'),
    (f) => f.change('second.md', ({ fm }) => fm.work_execution.units.find((u) => u.id === 'layout').kind = 'behavior'),
    (f) => f.change('surface.md', ({ fm }) => fm.work_execution.units[0].host_visual_evidence['RESULT-002'].mapping_ref = 'artifact:MAP-1#component-mapping'),
    (f) => f.change('surface.md', ({ fm }) => fm.work_execution.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-999']),
  ]) {
    const f = fixture(t); const surface = withSurface(f); update(f); assert.throws(() => f.run(surface));
  }
});

test('D projection: missing opt-in, unknown/duplicate selectors and unresolved contracts are never defaulted away', (t) => {
  for (const update of [
    (f) => f.setPolicy(policy([])),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.units.push(unit())),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts.push('artifact:DOC#rules')),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.units[0].kind = 'custom'),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts = ['artifact:DOC#absent']),
    (f) => f.change('screen.md', ({ fm }) => fm.work_execution = null),
  ]) { const f = fixture(t); update(f); assert.throws(() => f.run()); }
});

test('D projection: stale snapshot metadata and symlink policy files are rejected before projection', (t) => {
  const f = fixture(t); const options = f.options();
  f.change('screen.md', ({ fm }) => fm.status = 'confirmed');
  assert.throws(() => resolveScopedUnitProjection(options), /indexed snapshot/);
  const other = fixture(t); const opts = other.options();
  const link = path.join(other.root, 'policy-link.yaml'); fs.symlinkSync(opts.policyFile, link);
  assert.throws(() => resolveScopedUnitProjection({ ...opts, policyFile: link }));
});
