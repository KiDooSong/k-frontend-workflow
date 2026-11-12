import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { COMPONENT_MAPPING_COLUMNS, MAPPING_PROVENANCE_COLUMNS } from './mapping-provenance.mjs';
import { inspectScopedProfile, inspectScopedSnapshotProfile } from './scoped-work-profiles.mjs';
import { resolveScopedUncertaintyBindingBasis } from './scoped-work-uncertainty-scopes.mjs';

const OWNER = 'screen:RESULT-001', PREFIX = 'src/features/result';
const INPUT = 'IN-20260922-figma-001', ANCHOR = `input:${INPUT}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const unit = (kind = 'behavior') => ({ id: 'known', kind, contracts: ['artifact:RULES#rules'], sources: [] });
const candidate = (confidence = 'confirmed', gate = 'active') => ['GET', '/results', confidence, gate, gate === 'deferred' ? 'issue:#12' : '', 'src/api/results/**'];
const apiBody = (rows = [candidate()]) => `## API Candidates\n${table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'], rows)}`;
const endpointRow = (kind = 'manual', name = 'ResultsResponse', source = 'contracts/result.md') => ['GET', '/results', 'confirmed', name, kind, source];
const manifestBody = (rows) => `## Endpoints\n${table(['Method', 'Path', 'Confidence', 'Linked Contract', 'Contract Kind', 'Source'], rows)}`;

function compareProfiles(options) {
  let expected;
  try { expected = inspectScopedProfile(options); }
  catch (error) {
    assert.throws(() => inspectScopedSnapshotProfile(options), { name: error.name, message: error.message });
    throw error;
  }
  const actual = inspectScopedSnapshotProfile(options);
  assert.deepEqual(actual, expected, 'snapshot reuse must preserve the entire public profile result');
  return actual;
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-profiles-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map(), inputs = [];
  fs.mkdirSync(kitRoot);
  const raw = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file; };
  // #257: the base policy never adopts; work_execution lives only in the policy overlay.
  const policyFile = raw('.kit/policy.yaml', JSON.stringify({}));
  const overlayFile = raw('.kit/adoption.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const layoutFile = raw('.kit/layout.yaml', JSON.stringify({ roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } }));
  const manifestFile = raw('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  const write = (name, fm, body) => { const file = raw(`docs/${name}`, md(fm, body)); docs.set(name, file); return file; };
  const change = (name, edit) => { const file = docs.get(name), old = splitFrontmatter(fs.readFileSync(file, 'utf8')); const next = { fm: old.data, body: old.body }; edit(next); fs.writeFileSync(file, md(next.fm, next.body)); };
  write('screen.md', { artifact_id: 'SCREEN', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result', status: 'draft', api_required: false,
    screen_entry: `${PREFIX}/screens/Result.tsx`, work_execution: { version: 1, units: [unit()] } }, '## Notes\nExisting draft screen, no final Figma.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed',
    approved_by: 'synthetic-fixture-owner', approved_at: '2026-09-22', decision_id: 'fixture-known-contract' },
  '## Rules\nUse the existing local value without network calls. State, interaction, data and copy relevance remains a scope review responsibility.\n\n## Other\nUnselected text.');
  const registerFile = path.join(docsDir, 'register.md');
  const options = () => ({ owner: OWNER, unit: 'known', projectRoot: root, docsDir, kitRoot, policyFile, policyOverlayFile: overlayFile, layoutFile, manifestFile, registerFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) => ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }),
    inputArtifacts: inputs.map(loadInputArtifact), origin_inputs: [], coverage_reports: [] });
  const api = (kind = 'api-contract', rows = [candidate()]) => {
    change('screen.md', (doc) => { doc.fm.api_required = true; doc.fm.work_execution.units = [{ ...unit(kind), api_candidates: [{ method: 'GET', path: '/results' }] }]; doc.body = apiBody(rows); });
    write('api.md', { artifact_id: 'API', artifact_type: 'api-manifest', status: 'draft' }, manifestBody([endpointRow()]));
    raw('contracts/result.md', '## ResultsResponse\nAn existing explicit manual contract.');
  };
  const visual = () => {
    change('screen.md', ({ fm }) => fm.work_execution.units = [{ ...unit('visual'), contracts: ['artifact:MAP#component-mapping/M-001'] }]);
    write('mapping.md', { artifact_id: 'MAP', artifact_type: 'figma-component-mapping', screen_id: 'RESULT-001', domain: 'result', status: 'draft', provenance_contract: 1 },
      `## Component Mapping\n${table(COMPONENT_MAPPING_COLUMNS, [['\`M-001\` · result', 'Result', `${PREFIX}/components/Result.tsx`, 'Existing frame']])}\n\n## Mapping Provenance\n${table(MAPPING_PROVENANCE_COLUMNS, [['M-001', 'inherit', 'node', 'inherit', ANCHOR]])}`);
    inputs.push(raw('docs/input.md', md({ input_id: INPUT, input_type: 'figma', source_type: 'figma', source_ref: 'figma://file/profile-fixture/node/1:1',
      captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] }, '## Extracted Facts\n- Selected original frame.')));
    raw('docs/register.md', md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
      `${table(REQUIRED_REGISTER_COLS, [[INPUT, 'figma', 'simple-update×1', 'reconciled', 'accepted', 'artifact:MAP', '-', '-']])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, [[INPUT, '01', 'visual-evidence', 'simple-update', 'update', 'artifact:MAP#component-mapping/M-001', ANCHOR, 'inherit', 'node', 'inherit']])}`));
  };
  return { root, docs, inputs, docsDir, raw, write, change, options, api, visual, policyFile, overlayFile, manifestFile, registerFile, run: (extra = {}) => compareProfiles({ ...options(), ...extra }) };
}
const denied = (result, code) => { assert.equal(result.profile_satisfied, false); assert.ok(result.denials.some((entry) => entry.code === code), JSON.stringify(result.denials)); };
const noGrant = (result) => { assert.equal(Object.hasOwn(result, 'ready'), false); assert.equal(Object.hasOwn(result, 'allowed_paths'), false); assert.equal(result.approval_verified, false); assert.equal(result.semantic_coverage_verified, false); };

test('D profiles: known no-API behavior uses a selected confirmed domain contract without final Figma or promoting its draft screen', (t) => {
  const f = fixture(t), before = fs.readFileSync(f.docs.get('screen.md')), out = f.run();
  assert.equal(out.profile_satisfied, true); assert.deepEqual(out.confirmed_contracts, ['artifact:RULES#rules']);
  assert.deepEqual(out.visual_evidence, []); assert.deepEqual(fs.readFileSync(f.docs.get('screen.md')), before); noGrant(out);
});

for (const [label, update] of [
  ['draft', (doc) => doc.fm.status = 'draft'], ['missing approver', (doc) => delete doc.fm.approved_by],
  ['missing approval date', (doc) => delete doc.fm.approved_at], ['invalid date', (doc) => doc.fm.approved_at = '2026-02-30'],
  ['missing decision evidence', (doc) => delete doc.fm.decision_id], ['heading only', (doc) => doc.body = '## Rules\n'],
]) test(`D profiles: ${label} does not establish a confirmed authored behavior contract`, (t) => {
  const f = fixture(t); f.change('rules.md', update); denied(f.run(), 'confirmed-behavior-contract-required');
});

test('D profiles: confirmed unselected contracts cannot establish the selected draft behavior', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => fm.work_execution.units[0].contracts = ['artifact:SCREEN#notes']);
  denied(f.run(), 'confirmed-behavior-contract-required');
});

test('D profiles: no API selection needs explicit canonical api_required false, not a caller boolean', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => delete fm.api_required);
  denied(f.run({ api_required: false }), 'api-selection-required');
});

test('D profiles: selected confirmed active API uses the existing manifest/manual contract check without UI promotion', (t) => {
  const f = fixture(t); f.api(); f.change('rules.md', ({ fm }) => fm.status = 'draft'); const out = f.run();
  assert.equal(out.profile_satisfied, true); assert.equal(out.kind, 'api-contract'); assert.equal(out.api_evidence[0].satisfied, true);
  assert.ok(out.read_set.some((entry) => entry.file === 'contracts/result.md')); noGrant(out);
});

test('D profiles: known behavior plus actual API evidence does not wait for a Figma mapping', (t) => {
  const f = fixture(t); f.api('behavior'); const out = f.run(); assert.equal(out.profile_satisfied, true); assert.deepEqual(out.visual_evidence, []);
});

for (const [label, rows] of [['candidate', [candidate('candidate')]], ['deferred', [candidate('candidate', 'deferred')]]]) {
  test(`D profiles: ${label} API remains evidence but cannot authorize API-contract work`, (t) => {
    const f = fixture(t); f.api('api-contract', rows); denied(f.run(), 'api-not-confirmed-active');
  });
}

test('D profiles: absent/unknown/conflicting manifest evidence cannot be borrowed from another endpoint', (t) => {
  const f = fixture(t); f.api(); f.change('api.md', (doc) => doc.body = manifestBody([['GET', '/other', ...endpointRow().slice(2)]]));
  denied(f.run(), 'api-manifest-unconfirmed');
  f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('unknown')])); denied(f.run(), 'api-contract-unresolved');
  f.change('api.md', (doc) => doc.body = manifestBody([endpointRow(), endpointRow('manual', 'DifferentResponse')])); denied(f.run(), 'api-manifest-conflict');
});

test('D profiles: ts-type evidence uses actual exported type/interface, not an arbitrary runtime export', (t) => {
  const f = fixture(t); f.api(); f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('ts-type', 'ResultsResponse', 'src/api/results/types.ts')]));
  f.raw('src/api/results/types.ts', 'export interface ResultsResponse { value: string }'); assert.equal(f.run().profile_satisfied, true);
  f.raw('src/api/results/types.ts', 'export const ResultsResponse = {};'); denied(f.run(), 'api-contract-evidence-missing');
});

test('D profiles: zod evidence retains the existing runtime export check and pins the selected schema directory', (t) => {
  const f = fixture(t); f.api(); f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('zod')]));
  f.raw('src/api/schemas/results.ts', 'export const ResultsResponse = existingSchema;'); const out = f.run();
  assert.equal(out.profile_satisfied, true); assert.ok(out.directory_read_set.some((entry) => entry.file === 'src/api/schemas'));
  f.raw('src/api/schemas/results.ts', 'export type ResultsResponse = {};'); denied(f.run(), 'api-contract-evidence-missing');
});

test('D profiles: actual OpenAPI evidence is distinct from manual or TS runtime validation claims', (t) => {
  const f = fixture(t); f.api(); f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('openapi', 'ResultsResponse', 'contracts/api.yaml')]));
  f.raw('contracts/api.yaml', 'components:\n  schemas:\n    ResultsResponse:\n      type: object\n'); const out = f.run();
  assert.equal(out.profile_satisfied, true); assert.equal(out.api_evidence[0].semantic_contract_verified, false);
  f.raw('contracts/api.yaml', 'components: {}\n'); denied(f.run(), 'api-contract-evidence-missing');
});

test('D profiles: missing evidence, escaping paths and symlinked source cannot become an API contract', (t) => {
  const f = fixture(t); f.api(); fs.unlinkSync(path.join(f.root, 'contracts/result.md')); denied(f.run(), 'api-contract-evidence-missing');
  f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('manual', 'ResultsResponse', '../outside.md')])); assert.throws(() => f.run());
  f.change('api.md', (doc) => doc.body = manifestBody([endpointRow()]));
  f.raw('contracts/actual.md', 'ResultsResponse'); fs.symlinkSync('actual.md', path.join(f.root, 'contracts/result.md')); assert.throws(() => f.run(), /symlink/);
});

test('D profiles: selected Figma M-key with matching provenance and actual input coverage satisfies visual prerequisites only', (t) => {
  const f = fixture(t); f.visual(); const out = f.run(); assert.equal(out.profile_satisfied, true);
  assert.equal(out.visual_evidence.length, 1); assert.equal(out.visual_evidence[0].selection.key, 'M-001'); noGrant(out);
});

test('D profiles: source text without real mapping, deprecated mapping and another screen mapping do not satisfy visual', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => fm.work_execution.units = [unit('visual')]); denied(f.run(), 'visual-mapping-evidence-required');
  const g = fixture(t); g.visual(); g.change('mapping.md', ({ fm }) => fm.status = 'deprecated'); denied(g.run(), 'visual-mapping-deprecated');
  g.change('mapping.md', ({ fm }) => { fm.status = 'draft'; fm.screen_id = 'RESULT-002'; }); assert.throws(() => g.run());
});

test('D profiles: valid visual mapping cannot bypass missing current partial coverage', (t) => {
  const f = fixture(t); f.visual(); fs.writeFileSync(f.registerFile, fs.readFileSync(f.registerFile, 'utf8').replace('reconciled | accepted', 'partially-reconciled | pending'));
  denied(f.run(), 'source-coverage-unready');
});

test('D profiles: an unresolved unit Unknown is not an inferred unrelated fact or a fake resolved state', (t) => {
  const f = fixture(t); f.change('rules.md', (doc) => doc.body += `\n\n## Unknowns\n${table(['ID', 'Question'], [['U-ONE', 'What is unresolved?']])}`);
  denied(f.run(), 'unit-uncertainty-unresolved');
});

test('D profiles: a resolved Unknown no longer blocks; any other Status still does (#262)', (t) => {
  const f = fixture(t), clean = f.run();
  const status = (value) => {
    f.change('rules.md', (doc) => { doc.body = `${doc.body.replace(/\n\n## Unknowns\n[\s\S]*$/, '')}\n\n## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-ONE', 'What was unknown?', value]])}`; });
    return f.run();
  };
  for (const value of ['resolved', 'Resolved']) {
    const out = status(value);
    assert.deepEqual([out.profile_satisfied, out.denials], [clean.profile_satisfied, clean.denials], value);
  }
  for (const value of ['open', '', 'unknown', 'resolved <!-- pending -->']) denied(status(value), 'unit-uncertainty-unresolved');
});

test('D profiles: profile/owner opt-in and lifecycle are actual canonical facts, not caller overrides', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => fm.status = 'deprecated'); denied(f.run(), 'owner-inactive');
  f.change('screen.md', ({ fm }) => fm.status = 'draft'); const policy = JSON.parse(fs.readFileSync(f.overlayFile)); policy.work_execution.profiles = ['visual'];
  fs.writeFileSync(f.overlayFile, JSON.stringify(policy)); denied(f.run({ profile_enabled: true }), 'profile-not-enabled');
});

for (const [label, inspect] of [['mutable', inspectScopedProfile], ['snapshot', inspectScopedSnapshotProfile]]) {
  test(`D profiles: ${label} selected contract/evidence byte mutation is detected without modifying the index`, (t) => {
    const f = fixture(t); f.api(); const options = f.options(), original = fs.openSync; let changed = false;
    const hook = t.mock.method(fs, 'openSync', function (name, ...args) {
      const fd = original.call(this, name, ...args);
      if (!changed && name === path.join(f.root, 'contracts/result.md')) { changed = true; fs.appendFileSync(f.docs.get('rules.md'), '\nChanged during inspection.'); }
      return fd;
    });
    try { assert.throws(() => inspect(options), /snapshot changed/); assert.equal(changed, true); }
    finally { hook.mock.restore(); }
  });

  test(`D profiles: ${label} directory membership mutation during the existing contract helper is not invisible`, (t) => {
    const f = fixture(t); f.api(); f.change('api.md', (doc) => doc.body = manifestBody([endpointRow('manual', 'ResultsResponse', 'contracts')]));
    const options = f.options(), original = fs.readFileSync; let changed = false;
    const hook = t.mock.method(fs, 'readFileSync', function (name, ...args) {
      const value = original.call(this, name, ...args);
      if (!changed && name === path.join(f.root, 'contracts/result.md')) { changed = true; f.raw('contracts/new.md', 'New additional evidence.'); }
      return value;
    });
    try { assert.throws(() => inspect(options), /directory changed/); assert.equal(changed, true); }
    finally { hook.mock.restore(); }
  });
}

test('D profiles: inspection preserves source bytes and returns explicit semantic, scope and Git review responsibilities', (t) => {
  const f = fixture(t), before = [...f.docs.values()].map((file) => fs.readFileSync(file)), out = f.run({ ready: true, selected_contracts: [], approved_by: 'caller' });
  assert.equal(out.profile_satisfied, true); assert.ok(out.required_reviews.some((text) => text.includes('immutable Git'))); noGrant(out);
  [...f.docs.values()].forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
});

test('W10: visual isolation needs an open Decision that actually applies to the disabled behavior units', (t) => {
  const f = fixture(t); f.visual();
  const isolation = { decisions: ['decision:D-ONE@open-decision-register'], disabled_units: ['later'], exposure: 'development-only' };
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE']; fm.work_execution.units = [{ ...fm.work_execution.units[0], isolation }, { ...unit(), id: 'later' }]; });
  const decision = (status) => f.write('global/open-decisions.md', { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' },
    `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], [['D-ONE', 'Choose the retry behavior.', 'A / B', 'api-integrated-ui', 'PM', status]])}`);
  decision('open');
  const out = f.run();
  assert.equal(out.profile_satisfied, true, JSON.stringify(out.denials));
  assert.deepEqual(out.isolation.map((entry) => [entry.disabled_units, entry.exposure, entry.semantic_isolation_verified]), [[['later'], 'development-only', false]]);
  assert.match(out.isolation[0].responsibility, /disabled UI alone is not proof/); noGrant(out);
  const expected = structuredClone(out);
  out.isolation[0].decisions.push('decision:D-CALLER@open-decision-register');
  out.isolation[0].disabled_units.push('caller-unit');
  out.visual_evidence[0].metadata.status = 'deprecated';
  out.read_set[0].file = 'caller-mutated.md';
  out.coverage.denials.push({ code: 'caller-denial' });
  assert.deepEqual(f.run(), expected, 'mutable returned arrays and evidence must not affect later inspections');
  decision('resolved'); denied(f.run(), 'isolation-decision-unrelated');
  decision('open'); f.change('screen.md', ({ fm }) => { delete fm.decision_refs; }); denied(f.run(), 'isolation-decision-unrelated');
});

test('D profiles: an unaudited uncertainty section is a required review, not a denial (#260)', (t) => {
  const f = fixture(t), clean = f.run();
  f.write('other.md', { artifact_id: 'OTHER', artifact_type: 'domain-rules', domain: 'other', status: 'draft' }, '## Unknowns\nNone — no new open questions.');
  const out = f.run();
  assert.deepEqual([out.profile_satisfied, out.denials], [clean.profile_satisfied, clean.denials]);
  const added = out.required_reviews.filter((entry) => !clean.required_reviews.includes(entry));
  assert.equal(added.length, 1);
  assert.match(added[0], /^Unaudited uncertainty section docs\/other\.md#unknowns: SW-UNCERTAINTY: one canonical unknown table required\./);
});

function nativeUnknown(f) {
  f.change('screen.md', ({ fm }) => fm.work_execution.units.push({ ...unit(), id: 'later' }));
  const file = f.write('uncertainty.md', { artifact_id: 'UNCERTAINTY', artifact_type: 'domain-rules', domain: 'result', status: 'draft',
    uncertainty_work_scopes: { version: 1, bindings: [{ unknown_id: 'U-ONE', owner: OWNER, known_units: ['known', 'later'], blocks: ['later'],
      basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:synthetic-profile-scope' }] } },
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-ONE', 'Which later behavior applies?', 'open']])}`);
  const ref = 'unknown:U-ONE@UNCERTAINTY';
  // A calculated digest in this synthetic fixture is not human approval.
  const digest = resolveScopedUncertaintyBindingBasis({ ...f.options(), uncertaintyRef: ref }).basis_digest;
  f.change('uncertainty.md', ({ fm }) => fm.uncertainty_work_scopes.bindings[0].basis_digest = digest);
  return { file, ref, digest };
}

test('#300 snapshot profiles preserve current, stale and resolved uncertainty scopes with the same basis and reviews', (t) => {
  const f = fixture(t), unknown = nativeUnknown(f), current = f.run();
  assert.equal(current.profile_satisfied, true);
  assert.equal(current.uncertainty_scopes[0].computed_basis_digest, unknown.digest);
  assert.equal(current.uncertainty_scopes[0].scope_source, 'current-canonical-declaration');
  assert.deepEqual(current.uncertainty_scopes[0].blocking_units, ['later']);
  assert.ok(current.required_reviews.some((entry) => entry.includes('review:synthetic-profile-scope')));
  const expected = structuredClone(current);
  current.uncertainty_scopes[0].declared_binding.blocks.push('known');
  current.uncertainty_scopes[0].applications.length = 0;
  assert.deepEqual(f.run(), expected);
  f.change('rules.md', (doc) => doc.body = doc.body.replace('Use the existing local value', 'Use the newly specified local value'));
  const stale = f.run(); denied(stale, 'unit-uncertainty-unresolved');
  assert.equal(stale.uncertainty_scopes[0].binding_state, 'stale-basis');
  f.change('uncertainty.md', (doc) => doc.body = doc.body.replace('| open |', '| resolved |'));
  const resolved = f.run(); assert.equal(resolved.profile_satisfied, true);
  assert.equal(resolved.uncertainty_scopes[0].scope_source, 'resolved-uncertainty');
});

test('#300 snapshot profile calls keep owner facts, caller metadata and returned results independent', (t) => {
  const f = fixture(t), secondOwner = 'screen:OTHER-001';
  const metadata = splitFrontmatter(fs.readFileSync(f.docs.get('screen.md'), 'utf8')).data;
  f.write('other-screen.md', { ...metadata, artifact_id: 'OTHER-SCREEN', screen_id: 'OTHER-001', domain: 'other',
    screen_entry: 'src/features/other/screens/Other.tsx', work_execution: { version: 1, units: [{ ...unit(), contracts: ['artifact:OTHER#rules'] }] } }, '## Notes\nSecond owner.');
  f.write('other-rules.md', { artifact_id: 'OTHER', artifact_type: 'domain-rules', domain: 'other', status: 'draft' }, '## Rules\nAn unconfirmed different contract.');
  const adoption = JSON.parse(fs.readFileSync(f.overlayFile, 'utf8'));
  adoption.work_execution.owners.push(secondOwner); fs.writeFileSync(f.overlayFile, JSON.stringify(adoption));
  const options = f.options(), before = structuredClone(options), first = compareProfiles(options);
  assert.equal(first.profile_satisfied, true);
  denied(compareProfiles({ ...options, owner: secondOwner }), 'confirmed-behavior-contract-required');
  assert.deepEqual(compareProfiles(options), first);
  assert.deepEqual(options, before, 'snapshot inspection must not freeze or rewrite caller metadata');
  options.targetIndex.artifacts.get('RULES').fm.status = 'draft';
  assert.throws(() => compareProfiles(options), /metadata|snapshot|indexed/);
  assert.deepEqual(f.run(), first, 'a new call resolves current facts after a caller-owned index was changed');
});

function meetingSource(f, withRegister = true) {
  const inputId = 'IN-20260922-meeting-001', ref = `input:${inputId}#extracted-facts/01`;
  const metadata = { input_id: inputId, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:profile-source',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] };
  f.inputs.push(f.raw('docs/input.md', md(metadata, '## Extracted Facts\n- An existing selected fact.')));
  f.change('rules.md', (doc) => doc.body = doc.body.replace('## Rules\n', `## Rules\nSee ${ref}\n`));
  if (!withRegister) return { inputId, ref };
  const unrelated = 'IN-20260922-meeting-002';
  const file = f.raw('unselected-input.md', md({ ...metadata, input_id: unrelated, source_ref: 'meeting:unselected' },
    '## Extracted Facts\n- A rejected but validated fact.'));
  f.inputs.push(file);
  f.raw('docs/register.md', md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [
      [inputId, 'meeting', 'simple-update×1', 'reconciled', 'accepted', 'artifact:RULES', '-', '-'],
      [unrelated, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-'],
    ])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, [
      [inputId, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES#rules', ref, 'inherit', 'statement', 'inherit'],
      [unrelated, '01', 'reject', 'reject-input', 'reject', '-', `input:${unrelated}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
    ])}`));
  return { inputId, ref, file };
}

function afterApiContractRead(t, f, change) {
  const read = fs.readFileSync, state = { changed: false };
  const hook = t.mock.method(fs, 'readFileSync', function (file, ...args) {
    const result = read.call(this, file, ...args);
    if (!state.changed && file === path.join(f.root, 'contracts/result.md')) { state.changed = true; change(); }
    return result;
  });
  return { state, restore: () => hook.mock.restore() };
}

test('#300 snapshot profile rechecks validation-only input reads before narrowing uncertainty after independent coverage', (t) => {
  const f = fixture(t), input = meetingSource(f), unknown = nativeUnknown(f), before = f.run();
  const receipt = { ...before.coverage.sources[0].basis, review_scope: 'reconcile-stage04-v1', coverage: 'complete-for-unit' };
  const report = f.raw('review.md', `\`\`\`work-coverage\n${JSON.stringify(receipt)}\n\`\`\`\n`);
  const options = { ...f.options(), coverage_reports: ['review.md'] }, expected = compareProfiles(options);
  assert.equal(expected.profile_satisfied, true);
  assert.equal(expected.coverage.sources[0].receipt_state, 'current');
  assert.equal(expected.read_set.some((entry) => entry.file === 'unselected-input.md'), false);
  const original = fs.readFileSync(input.file, 'utf8'), open = fs.openSync, state = { changed: false, restored: false };
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    const fd = open.call(this, file, ...args), stack = new Error().stack;
    if (!state.changed && file === report && /at audit \([^\n]*scoped-work-profiles\.mjs:/.test(stack)) {
      // This report belongs only to the later coverage pass, not applicability.
      state.changed = true; fs.writeFileSync(input.file, original.replace('## Extracted Facts', '## Removed Facts'));
    } else if (state.changed && !state.restored && file === unknown.file && stack.includes('scoped-work-uncertainty-scopes.mjs')) {
      state.restored = true; fs.writeFileSync(input.file, original);
    }
    return fd;
  });
  try {
    assert.throws(() => inspectScopedSnapshotProfile(options), /input evidence changed|snapshot changed/);
    assert.equal(state.changed, true);
    assert.equal(state.restored, false, 'check private observations before using the binding, not only at final publication');
  } finally { hook.mock.restore(); }
});

test('#300 snapshot profile retains validation-only input observations through later API evidence and final publication', (t) => {
  const f = fixture(t); f.api('behavior'); const input = meetingSource(f), options = f.options(), expected = compareProfiles(options);
  assert.equal(expected.profile_satisfied, true);
  assert.equal(expected.read_set.some((entry) => entry.file === 'unselected-input.md'), false,
    'whole-register validation must not broaden selected evidence or the public read set');
  const original = fs.readFileSync(input.file, 'utf8');
  const mutation = afterApiContractRead(t, f, () => fs.writeFileSync(input.file, original.replace('## Extracted Facts', '## Removed Facts')));
  try {
    assert.throws(() => inspectScopedSnapshotProfile(options), /input evidence changed|snapshot changed/);
    assert.equal(mutation.state.changed, true);
  } finally { mutation.restore(); }
});

test('#300 snapshot profile retains another unit\'s consulted register absence through later API evidence', (t) => {
  const f = fixture(t); f.api('behavior'); const input = meetingSource(f, false);
  f.change('screen.md', ({ fm }) => fm.work_execution.units.push({ ...unit(), id: 'later', contracts: ['artifact:RULES#other'] }));
  f.change('rules.md', (doc) => doc.body = doc.body.replace(`See ${input.ref}\n`, '').replace('## Other\n', `## Other\nSee ${input.ref}\n`));
  const options = f.options(), expected = compareProfiles(options);
  assert.equal(expected.profile_satisfied, true);
  assert.equal(expected.read_set.some((entry) => entry.file === 'docs/register.md'), false);
  const mutation = afterApiContractRead(t, f, () => f.raw('docs/register.md', 'A newly appeared register.'));
  try {
    assert.throws(() => inspectScopedSnapshotProfile(options), /register appeared/);
    assert.equal(mutation.state.changed, true);
  } finally { mutation.restore(); }
});

test('#300 snapshot profile does not invent observations for an unused input or unconsulted register', (t) => {
  const f = fixture(t); f.api();
  const file = path.join(f.root, 'unused-input.md'), options = { ...f.options(), inputArtifacts: [{ file, hasFrontmatter: true, fm: {
    input_id: 'IN-20260922-meeting-999', input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:unused',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'],
  } }] }, expected = compareProfiles(options);
  const mutation = afterApiContractRead(t, f, () => {
    f.raw('unused-input.md', 'An unobserved input appeared.'); f.raw('docs/register.md', 'An unconsulted register appeared.');
  });
  try {
    assert.deepEqual(inspectScopedSnapshotProfile(options), expected);
    assert.equal(mutation.state.changed, true);
    assert.equal(expected.read_set.some((entry) => ['unused-input.md', 'docs/register.md'].includes(entry.file)), false);
  } finally { mutation.restore(); }
});
