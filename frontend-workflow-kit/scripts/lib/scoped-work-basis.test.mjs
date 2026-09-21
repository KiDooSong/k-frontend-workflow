import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { splitFrontmatter } from './util.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { scopeJson } from './scoped-work-normalize.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';

const OWNER = 'screen:RESULT-001';
const SECOND = 'screen:RESULT-002';
const ROOT = 'src/features/result';
const DECISION = 'decision:D-ONE@open-decision-register';
const INPUT = 'IN-20260921-meeting-001';
const REF = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const unit = (id = 'known', contracts = ['artifact:RULES#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const decisionRow = (id = 'D-ONE', question = 'Choose behavior.') => [id, question, 'A / B', 'api-integrated-ui', 'PM', 'open'];
const decisions = (rows) => `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], rows)}`;
const binding = (overrides = {}) => ({ decision_id: 'D-ONE', owner: OWNER, known_units: ['known', 'other'],
  blocks: ['other'], basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:original', ...overrides });
const policy = (owners = [OWNER]) => ({ work_execution: { version: 1, owners, profiles: ['visual', 'api-contract', 'behavior'],
  role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
    behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
const screen = (id = 'RESULT-001') => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `${ROOT}/screens/${id}.tsx`,
  work_execution: { version: 1, private_paths: { hook: [`${ROOT}/hooks/${id}/**`] },
    test_paths: [`${ROOT}/tests/${id}/**`], units: [unit(), unit('other', ['artifact:RULES#other'])] } });
const inputFm = (id = INPUT) => ({ input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:basis',
  captured_at: '2026-09-21T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] });

// Real files and canonical parsers, also executed beside the actual packed code.
// No mock projection/digest can stand in for selection, applicability or claims.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-basis-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit');
  fs.mkdirSync(kitRoot);
  const docs = new Map(), inputs = new Map();
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml');
  const manifestFile = path.join(kitRoot, 'manifest.yaml'), registerFile = path.join(root, 'register.md');
  const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  put(policyFile, policy());
  put(layoutFile, { roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } });
  put(manifestFile, { version: 1, artifacts: {} });
  const write = (name, fm, body, collection = docs) => {
    assert.ok(![...docs.keys(), ...inputs.keys()].some((other) => other !== name && other.toLowerCase() === name.toLowerCase()));
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); collection.set(name, file); return file;
  };
  const change = (name, update, collection = docs) => {
    const file = collection.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  write('screen.md', { ...screen(), decision_refs: ['D-ONE'] }, '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Other\nOther contract.\n\n## Untouched\nUnselected prose.');
  write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
    decision_work_scopes: { version: 1, bindings: [binding()] } }, decisions([decisionRow(), decisionRow('D-UNUSED', 'Unrelated decision.')]));
  const options = (owner = OWNER, decisionRef = DECISION) => ({ owner, decisionRef, projectRoot: root, docsDir, kitRoot,
    policyFile, layoutFile, manifestFile, registerFile, inputArtifacts: [...inputs.values()].map(loadInputArtifact),
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docs, inputs, write, change, put, policyFile, layoutFile, manifestFile, registerFile, options,
    run: (owner = OWNER, decisionRef = DECISION) => resolveScopedBindingBasis(options(owner, decisionRef)),
    bind: (value) => change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes.bindings = [value]; }) };
}
function withSource(f) {
  f.write('source.md', inputFm(), '## Extracted Facts\n- Retry up to `3` times.\n- Unselected fact.\n\n## Notes\nUnrelated.', f.inputs);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources = [{ input_id: INPUT, items: ['01'], source_refs: [REF] }]; });
  const items = [
    [INPUT, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES#rules', REF, 'inherit', 'statement', 'inherit'],
    [INPUT, '02', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES#other', REF.replace('/01', '/02'), 'inherit', 'statement', 'inherit'],
  ];
  const register = (rows = items) => fs.writeFileSync(f.registerFile, md({ reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'meeting', 'simple-update×2', 'partially-reconciled', 'pending', 'artifact:RULES', '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, rows)}`));
  register(); return { items, register };
}
const apiHeaders = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Notes'];
const apiRow = (endpoint = '/results', note = 'selected') => ['GET', endpoint, 'confirmed', 'active', '', `src/api${endpoint}/**`, note];
function withApi(f) {
  const rows = [apiRow(), apiRow('/later', 'unselected')];
  const body = (values = rows) => `## API Candidates\n${table(apiHeaders, values)}\n\n## Notes\nUnselected.`;
  f.change('screen.md', (doc) => { doc.fm.work_execution.units[0] = { ...unit(), kind: 'api-contract', api_candidates: [{ method: 'GET', path: '/results' }] }; doc.body = body(); });
  return { rows, body };
}
function withSurface(f, legacy = false) {
  const owner = 'surface:PANEL', hosts = {}, visual = {};
  f.put(f.policyFile, policy([owner, OWNER, ...legacy ? [] : [SECOND]]));
  for (const [number, name] of [[1, 'screen.md'], [2, 'second.md']]) {
    const id = `RESULT-00${number}`, mapping = `MAP-${number}`, input = `IN-20260921-figma-00${number}`;
    const evidence = `input:${input}#extracted-facts/01`, fm = screen(id);
    if (legacy && number === 2) delete fm.work_execution;
    else fm.work_execution.units = [{ ...unit('layout', [`artifact:${mapping}#component-mapping`]), kind: 'visual' }, unit('other', ['artifact:RULES#other'])];
    f.write(name, fm, '## Notes\nHost housekeeping.');
    f.write(`figma-${number}.md`, { ...inputFm(input), input_type: 'figma', source_type: 'figma',
      source_ref: `figma://file/fixture${number}/node/${number}:1`, affected_screens: [id] },
    '## Extracted Facts\n- Selected panel.\n- Other panel.', f.inputs);
    f.write(`mapping-${number}.md`, { artifact_id: mapping, artifact_type: 'figma-component-mapping', screen_id: id,
      domain: 'result', status: 'draft', provenance_contract: 1 },
    `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [
      ['`M-001` · panel node', 'Panel', `${ROOT}/components/panel/Panel.tsx`, 'shared'],
      ['`M-002` · other node', 'Other', `${ROOT}/components/panel/Other.tsx`, 'other'],
    ])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [
      ['M-001', 'inherit', 'node', 'inherit', evidence], ['M-002', 'inherit', 'node', 'inherit', evidence.replace('/01', '/02')],
    ])}\n\n## Notes\nMapping housekeeping.`);
    hosts[id] = legacy && number === 2 ? 'legacy-current' : 'layout';
    visual[id] = { mapping_ref: `artifact:${mapping}#component-mapping`, m_keys: ['M-001'] };
  }
  f.write('surface.md', { artifact_id: 'PANEL', artifact_type: 'shared-surface-spec', surface_id: 'PANEL', domain: 'result',
    status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], implementation_paths: [`${ROOT}/components/panel/**`], decision_refs: ['D-ONE'],
    work_execution: { version: 1, units: [{ ...unit('panel'), kind: 'visual', host_units: hosts, host_visual_evidence: visual }] } }, '## Notes\nSurface notes.');
  f.bind(binding({ owner, known_units: ['panel'], blocks: ['panel'] })); return owner;
}

test('D basis: complete file-backed projection is hashed with version 1, without approval or writes', (t) => {
  const f = fixture(t), before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.equal(out.basis.basis_version, 1); assert.deepEqual(out.basis.known_units, ['known', 'other']);
  assert.deepEqual(out.basis.binding, { decision: DECISION, owner: OWNER, known_units: ['known', 'other'], blocks: ['other'] });
  assert.equal(out.basis.units.length, 2); assert.ok(out.basis.ownership.units.length);
  assert.ok(out.basis.decision_relations.records.length); assert.ok(out.basis.uncertainty_relations);
  assert.equal(out.basis_digest, `sha256:${createHash('sha256').update(Buffer.from(scopeJson(out.basis), 'utf8')).digest('hex')}`);
  assert.deepEqual(out.recorded_binding, { basis_digest: binding().basis_digest, approval_ref: binding().approval_ref });
  for (const key of ['allowed', 'ready', 'effective_binding', 'approved', 'allowed_paths']) assert.equal(Object.hasOwn(out, key), false);
  assert.equal(Object.hasOwn(out.basis, 'read_set'), false);
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
  const other = fixture(t); assert.equal(other.run().basis_digest, out.basis_digest, 'absolute fixture root is not scope');
});

test('D basis: digest and approval self-fields change only the recorded binding and audit', (t) => {
  const f = fixture(t), before = f.run();
  f.bind(binding({ basis_digest: `sha256:${'1'.repeat(64)}`, approval_ref: 'review:changed' }));
  const after = f.run(); assert.deepEqual(after.basis, before.basis); assert.equal(after.basis_digest, before.basis_digest);
  assert.notDeepEqual(after.read_set, before.read_set); assert.notDeepEqual(after.recorded_binding, before.recorded_binding);
  assert.equal(scopeJson(after.basis).includes('review:changed'), false);
});

test('D basis: referenced canonical approval facts are retained instead of blanket removal', (t) => {
  const f = fixture(t), before = f.run();
  f.change('rules.md', ({ fm }) => { fm.approval_source = { type: 'review', ref: 'review:contract-scope' }; });
  const after = f.run(); assert.notEqual(after.basis_digest, before.basis_digest);
  assert.ok(scopeJson(after.basis).includes('review:contract-scope'));
});

test('D basis: explicit empty blocks differs from nonempty blocks and never means missing', (t) => {
  const f = fixture(t), before = f.run(); f.bind(binding({ blocks: [] }));
  const after = f.run(); assert.notEqual(after.basis_digest, before.basis_digest); assert.deepEqual(after.basis.binding.blocks, []);
  f.change('global/open-decisions.md', ({ fm }) => { delete fm.decision_work_scopes.bindings[0].blocks; });
  assert.throws(() => f.run(), /blocks/);
});

test('D basis: known_units must match all owner units, including additions and removals', (t) => {
  const f = fixture(t), before = f.run(); f.bind(binding({ known_units: ['known'], blocks: [] }));
  assert.throws(() => f.run(), /known_units/);
  f.bind(binding({ known_units: ['known', 'other', 'missing'] })); assert.throws(() => f.run(), /known_units/);
  f.bind(binding()); f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new')); });
  assert.throws(() => f.run(), /known_units/);
  f.bind(binding({ known_units: ['new', 'other', 'known'] })); assert.notEqual(f.run().basis_digest, before.basis_digest);
});

test('D basis: caller projection, binding, target subset and hash cannot replace canonical facts', (t) => {
  const f = fixture(t), before = f.run(), opts = f.options();
  assert.deepEqual(resolveScopedBindingBasis({ ...opts, projection: {}, binding: binding({ blocks: [] }),
    known_units: ['known'], blocks: [], units: ['known'], basis_digest: 'caller', allowed: true }), before);
  f.change('global/open-decisions.md', ({ fm }) => { delete fm.decision_work_scopes; });
  assert.throws(() => resolveScopedBindingBasis({ ...f.options(), binding: binding() }), /canonical.*binding/);
});

test('D basis: a binding for another owner or a nonapplicable Decision is not borrowed', (t) => {
  const f = fixture(t); f.bind(binding({ owner: SECOND })); assert.throws(() => f.run(), /canonical.*binding/);
  f.bind(binding({ decision_id: 'D-UNUSED' })); assert.throws(() => f.run(OWNER, 'decision:D-UNUSED@open-decision-register'), /does not apply/);
  assert.throws(() => f.run(OWNER, 'artifact:RULES#rules'), /typed decision/);
});

test('D basis: malformed canonical declarations fail before hashing rather than being defaulted', (t) => {
  for (const update of [
    (fm) => { fm.decision_work_scopes = null; },
    (fm) => { fm.decision_work_scopes.version = 2; },
    (fm) => { fm.decision_work_scopes.bindings.push(binding()); },
    (fm) => { fm.decision_work_scopes.bindings[0].known_units.push('known'); },
    (fm) => { fm.decision_work_scopes.bindings[0].blocks = ['missing']; },
    (fm) => { fm.decision_work_scopes.bindings[0].extra = true; },
    (fm) => { fm.decision_work_scopes.bindings[0].basis_digest = 'invalid'; },
  ]) {
    const f = fixture(t); f.change('global/open-decisions.md', ({ fm }) => update(fm)); assert.throws(() => f.run());
  }
});

test('D basis: canonical local Decision homes work and duplicate global identities remain errors', (t) => {
  const f = fixture(t);
  f.change('screen.md', (doc) => { doc.fm.decision_work_scopes = { version: 1, bindings: [binding({ decision_id: 'D-LOCAL' })] };
    doc.body += `\n\n${decisions([decisionRow('D-LOCAL')])}`; });
  const ref = 'decision:D-LOCAL@SCREEN-RESULT-001'; assert.equal(f.run(OWNER, ref).basis.binding.decision, ref);
  f.change('global/open-decisions.md', (doc) => { doc.body = decisions([decisionRow(), decisionRow('D-LOCAL')]); });
  assert.throws(() => f.run(OWNER, ref), /ambiguous|duplicate/);
});

test('D basis: Decision question, options and Blocking Mode each change the scope digest', (t) => {
  for (const [before, after] of [['Choose behavior.', 'Choose a different behavior.'], ['A / B', 'A / C'], ['api-integrated-ui', 'production-ready']]) {
    const f = fixture(t), out = f.run(); f.change('global/open-decisions.md', (doc) => { doc.body = doc.body.replace(before, after); });
    assert.notEqual(f.run().basis_digest, out.basis_digest);
  }
});

test('D basis: inverse uncertainty and its transitive Decision content enter the digest', (t) => {
  const f = fixture(t), before = f.run();
  f.write('unknown.md', { artifact_id: 'U-HOME', artifact_type: 'domain-rules', domain: 'foreign', status: 'draft' },
    `## Unknowns\n${table(['ID', 'Question'], [['U-ONE', 'See artifact:RULES#rules and decision:D-UNUSED@open-decision-register']])}`);
  const after = f.run(); assert.notEqual(after.basis_digest, before.basis_digest);
  assert.ok(after.basis.decision_relations.records.some((entry) => entry.decision_id === 'D-UNUSED'));
  f.change('global/open-decisions.md', (doc) => { doc.body = doc.body.replace('Unrelated decision.', 'Now selected indirectly.'); });
  assert.notEqual(f.run().basis_digest, after.basis_digest);
});

test('D basis: contracts used only by another known unit still change the binding digest', (t) => {
  const f = fixture(t), before = f.run();
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Other contract.', 'Different other-unit contract.'); });
  assert.notEqual(f.run().basis_digest, before.basis_digest);
});

test('D basis: unselected sections, unrelated Decision rows and housekeeping change audit only', (t) => {
  const f = fixture(t), before = f.run();
  f.change('rules.md', (doc) => { doc.fm.last_reviewed = '2026-09-22'; doc.body = doc.body.replace('Unselected prose.', 'Changed housekeeping.'); });
  f.change('screen.md', (doc) => { doc.body += '\nUnselected owner notes.'; });
  f.change('global/open-decisions.md', (doc) => { doc.body = doc.body.replace('Unrelated decision.', 'Still unrelated.');
    doc.fm.decision_work_scopes.bindings.push(binding({ decision_id: 'D-UNUSED', blocks: [] })); });
  const after = f.run(); assert.equal(after.basis_digest, before.basis_digest); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D basis: selected raw row cell order and explicit whole-body contracts remain meaningful', (t) => {
  const f = fixture(t);
  f.change('rules.md', (doc) => { doc.body += `\n\n## Rows\n${table(['ID', 'First', 'Second'], [['01', 'a', 'b']])}`; });
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = ['artifact:RULES#rows/01']; });
  const ordered = f.run(); f.change('rules.md', (doc) => { doc.body = doc.body.replace('| a | b |', '| b | a |'); });
  assert.notEqual(f.run().basis_digest, ordered.basis_digest);
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts.push('artifact:RULES'); });
  const broad = f.run(); f.change('rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Selected by broad contract.'); });
  assert.notEqual(f.run().basis_digest, broad.basis_digest);
});

test('D basis: LF and CRLF selected bodies have the same digest but different audit hashes', (t) => {
  const f = fixture(t), before = f.run(), file = f.docs.get('rules.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const after = f.run(); assert.equal(after.basis_digest, before.basis_digest); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D basis: set permutations and object key order cannot create spurious scope changes', (t) => {
  const f = fixture(t); f.bind(binding({ blocks: ['known', 'other'] }));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts.push('artifact:RULES#other'); });
  const before = f.run(); f.bind(binding({ known_units: ['other', 'known'], blocks: ['other', 'known'] }));
  f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts.reverse(); fm.work_execution.units.reverse(); });
  const p = policy(); p.work_execution.profiles.reverse(); p.work_execution.role_limits.behavior.reverse(); f.put(f.policyFile, p);
  const after = f.run(); assert.equal(after.basis_digest, before.basis_digest); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D basis: changed indexed bytes and unresolved or duplicate contracts cannot produce a hash', (t) => {
  const f = fixture(t), opts = f.options(); f.bind(binding({ blocks: [] }));
  assert.throws(() => resolveScopedBindingBasis(opts), /snapshot|differs|changed/);
  for (const contracts of [['artifact:MISSING'], ['artifact:RULES#rules', 'artifact:RULES#rules']]) {
    f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = contracts; }); assert.throws(() => f.run());
  }
});

test('D basis: entry, private paths, role ceilings and explicit denies each affect scope', (t) => {
  for (const update of [
    (f) => f.change('screen.md', ({ fm }) => { fm.screen_entry = `${ROOT}/screens/Changed.tsx`; }),
    (f) => f.change('screen.md', ({ fm }) => { fm.work_execution.private_paths.hook.push(`${ROOT}/hooks/extra/**`); }),
    (f) => { const p = policy(); p.work_execution.role_limits.behavior.pop(); f.put(f.policyFile, p); },
    (f) => { const p = policy(); p.work_execution.deny_paths.push(`${ROOT}/screens/**`); f.put(f.policyFile, p); },
  ]) { const f = fixture(t), before = f.run(); update(f); assert.notEqual(f.run().basis_digest, before.basis_digest); }
});

test('D basis: selected input inline code and its source metadata are scope, not just raw hashes', (t) => {
  const f = fixture(t); withSource(f); const before = f.run();
  f.change('source.md', (doc) => { doc.body = doc.body.replace('`3`', '`10`'); }, f.inputs);
  const changed = f.run(); assert.notEqual(changed.basis_digest, before.basis_digest); assert.ok(scopeJson(changed.basis).includes('`10`'));
  f.change('source.md', ({ fm }) => { fm.source_ref = 'meeting:changed'; }, f.inputs);
  assert.notEqual(f.run().basis_digest, changed.basis_digest);
});

test('D basis: selected Item effects and input/item/anchor selectors each affect the digest', (t) => {
  const f = fixture(t), source = withSource(f), before = f.run();
  const rows = structuredClone(source.items); rows[0][5] = 'artifact:RULES#other'; source.register(rows);
  assert.notEqual(f.run().basis_digest, before.basis_digest);
  source.register(); f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].sources[0] = {
    input_id: INPUT, items: ['02'], source_refs: [REF.replace('/01', '/02')],
  }; });
  assert.notEqual(f.run().basis_digest, before.basis_digest);
});

test('D basis: unselected input bullets and unrelated Item effects only change audit evidence', (t) => {
  const f = fixture(t), source = withSource(f), before = f.run();
  f.change('source.md', (doc) => { doc.body = doc.body.replace('Unselected fact.', 'Changed unselected fact.'); }, f.inputs);
  const rows = structuredClone(source.items); rows[1][5] = 'artifact:RULES#rules'; source.register(rows);
  const after = f.run(); assert.equal(after.basis_digest, before.basis_digest); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D basis: API endpoint selection and entire selected Candidate row affect scope', (t) => {
  const f = fixture(t), api = withApi(f), before = f.run();
  const rows = structuredClone(api.rows); rows[0][6] = 'Changed selected note.';
  f.change('screen.md', (doc) => { doc.body = api.body(rows); }); assert.notEqual(f.run().basis_digest, before.basis_digest);
  f.change('screen.md', (doc) => { doc.fm.work_execution.units[0].api_candidates[0].path = '/other-results';
    doc.body = api.body([apiRow('/other-results'), api.rows[1]]); });
  assert.notEqual(f.run().basis_digest, before.basis_digest);
});

test('D basis: unrelated nonoverlapping API Candidate rows do not change scope', (t) => {
  const f = fixture(t), api = withApi(f), before = f.run();
  const rows = structuredClone(api.rows); rows[1][6] = 'Changed unselected note.';
  f.change('screen.md', (doc) => { doc.body = api.body(rows); });
  const after = f.run(); assert.equal(after.basis_digest, before.basis_digest); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D basis: both hosts and the selected host unit content participate in a surface binding', (t) => {
  const f = fixture(t), owner = withSurface(f), before = f.run(owner);
  assert.equal(before.basis.host_links.length, 2);
  f.change('second.md', ({ fm }) => { fm.work_execution.units[0].contracts.push('artifact:RULES#other'); });
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest);
  f.change('second.md', ({ fm }) => { fm.work_execution.units[0].contracts.pop(); fm.work_execution.units[0].id = 'layout-next'; });
  f.change('surface.md', ({ fm }) => { fm.work_execution.units[0].host_units['RESULT-002'] = 'layout-next'; });
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest);
});

test('D basis: M-key selection and selected mapping provenance alter a surface digest', (t) => {
  const f = fixture(t), owner = withSurface(f), before = f.run(owner);
  f.change('surface.md', ({ fm }) => { fm.work_execution.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-002']; });
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest);
  f.change('surface.md', ({ fm }) => { fm.work_execution.units[0].host_visual_evidence['RESULT-002'].m_keys = ['M-001']; });
  f.change('figma-2.md', (doc) => { doc.body = doc.body.replace('Selected panel.', 'Changed selected panel.'); }, f.inputs);
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest);
});

test('D basis: explicit whole mapping contracts remain broad while unrelated mapping notes stay out', (t) => {
  const f = fixture(t), owner = withSurface(f), before = f.run(owner);
  f.change('mapping-2.md', (doc) => { doc.body = doc.body.replace('Mapping housekeeping.', 'Different notes.'); });
  assert.equal(f.run(owner).basis_digest, before.basis_digest);
  f.change('mapping-2.md', (doc) => { doc.body = doc.body.replace('| Other |', '| DifferentOther |'); });
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest, 'the host separately contracts the entire mapping section');
});

test('D basis: legacy host boundary remains in scope without implying a usable base envelope', (t) => {
  const f = fixture(t), owner = withSurface(f, true), before = f.run(owner);
  assert.deepEqual(before.basis.ownership.requires_legacy_base, [SECOND]);
  assert.equal(Object.hasOwn(before, 'allowed_paths'), false);
  f.change('second.md', ({ fm }) => { fm.screen_entry = `${ROOT}/screens/LegacyChanged.tsx`; });
  assert.notEqual(f.run(owner).basis_digest, before.basis_digest);
});

test('D basis: recursive cycles are finitely indexed before hashing, with stable repeat results', (t) => {
  const f = fixture(t);
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'See artifact:EXTRA#rules'); });
  f.write('extra.md', { artifact_id: 'EXTRA', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nSee artifact:RULES#rules');
  const before = f.run(); assert.equal(f.run().basis_digest, before.basis_digest);
  f.change('extra.md', (doc) => { doc.body += '\nChanged selected dependency.'; });
  assert.notEqual(f.run().basis_digest, before.basis_digest);
});
