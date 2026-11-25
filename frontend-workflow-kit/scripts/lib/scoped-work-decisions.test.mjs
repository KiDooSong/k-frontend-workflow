import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedDecisionProjection } from './scoped-work-decisions.mjs';
import { resolveScopedApplicabilityProjection, resolveScopedSnapshotApplicabilityProjection } from './scoped-work-applicability.mjs';
import { inspectScopedDecisionScopes, inspectScopedSnapshotDecisionScopes } from './scoped-work-decision-scopes.mjs';
import { resolveScopedBindingBasis, scopedBindingBasis } from './scoped-work-basis.mjs';

const OWNER = 'screen:RESULT-001';
const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const headers = ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'];
const row = (id, question = 'Choose behavior.', options = 'A / B', status = 'open') =>
  [id, question, options, 'api-integrated-ui', 'PM', status];
const table = (cols, rows) => [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const decisions = (rows) => `## Open Decisions\n${table(headers, rows)}`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const unit = (id = 'known', contracts = ['artifact:RULES#rules']) => ({ id, kind: 'behavior', contracts, sources: [] });
const screen = (id = 'RESULT-001') => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: id,
  domain: 'result', status: 'draft', screen_entry: `src/features/result/screens/${id}.tsx`,
  work_execution: { version: 1, units: [unit()] } });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-decisions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs');
  const docs = new Map();
  const policyFile = path.join(root, 'policy.yaml'), overlayFile = path.join(root, 'adoption.yaml');
  fs.writeFileSync(policyFile, JSON.stringify({}));
  const adopt = (owners = [OWNER]) => fs.writeFileSync(overlayFile, JSON.stringify({ work_execution: { version: 1,
    owners, profiles: ['behavior'], role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  const write = (name, fm, body) => {
    assert.ok(![...docs.keys()].some((other) => other !== name && other.toLowerCase() === name.toLowerCase()),
      'fixture documents must remain distinct on case-insensitive filesystems');
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, body)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name); const parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const data = { fm: parsed.data, body: parsed.body }; update(data); fs.writeFileSync(file, md(data.fm, data.body));
  };
  const global = (rows = [row('D-GLOBAL'), row('D-OTHER')], name = 'global/open-decisions.md') =>
    write(name, { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft' }, decisions(rows));
  adopt();
  write('screen.md', screen(), '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown behavior.\n\n## Other\nUnselected behavior.');
  const options = (owner = OWNER) => ({ owner, policyFile, policyOverlayFile: overlayFile, docsDir, projectRoot: root, layout,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  return { root, docsDir, docs, write, change, global, adopt, options,
    run: (owner = OWNER) => resolveScopedDecisionProjection(options(owner)) };
}
function surface(f, { id = 'PANEL', refs = ['D-GLOBAL'], adopted = false } = {}) {
  if (!f.docs.has('second.md')) f.write('second.md', screen('RESULT-002'), '## Notes\nOther host.');
  const owner = `surface:${id}`;
  if (adopted) f.adopt([OWNER, 'screen:RESULT-002', owner]);
  f.write(`${id}.md`, { artifact_id: id, artifact_type: 'shared-surface-spec', surface_id: id,
    domain: 'result', status: 'draft', member_screens: ['RESULT-001', 'RESULT-002'], decision_refs: refs,
    implementation_paths: ['src/features/result/components/panel/**'],
    ...(adopted ? { work_execution: { version: 1, units: [{ ...unit(), host_units: {
      'RESULT-001': 'known', 'RESULT-002': 'known',
    } }] } } : {}),
  }, '## Notes\nShared behavior.');
  return owner;
}
const relation = (out) => out.projection.decision_relations;
const ids = (out) => relation(out).records.map((record) => record.decision_id).sort();

const API_DECISION = 'decision:D-SHARED@OTHER-SPEC';
function apiDecisionFixture(t, indirect = false) {
  const f = fixture(t), kitRoot = path.join(f.root, '.kit');
  fs.mkdirSync(kitRoot);
  const layoutFile = path.join(kitRoot, 'layout.yaml'), manifestFile = path.join(kitRoot, 'manifest.yaml');
  fs.writeFileSync(layoutFile, JSON.stringify({ roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'],
    test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } }));
  fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, artifacts: {} }));
  f.change('screen.md', (doc) => {
    const behavior = ['artifact:SCREEN-RESULT-001#behavior'];
    doc.fm.work_execution.units = [unit('explicit', [API_DECISION]),
      { ...unit('api', behavior), api_candidates: [{ method: 'GET', path: '/items' }] },
      { ...unit('control', behavior), api_candidates: [{ method: 'GET', path: '/health' }] }];
    doc.body = '## Behavior\n\nSelected behavior.\n\n## API Candidates\n\n' +
      table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths', 'Note'], [
        ['GET', '/items', 'confirmed', 'active', '-', 'src/api/items/example.ts',
          `See \`${indirect ? 'artifact:RULES#rules' : API_DECISION}\``],
        ['GET', '/health', 'confirmed', 'active', '-', 'src/api/health/example.ts', 'See artifact:RULES#other'],
        ['GET', '/unselected', 'confirmed', 'active', '-', 'src/api/unselected/example.ts', 'See decision:D-UNSELECTED@OTHER-SPEC'],
      ]);
  });
  if (indirect) f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known behavior.', `See ${API_DECISION}`); });
  f.write('decision.md', { artifact_id: 'OTHER-SPEC', artifact_type: 'screen-spec', screen_id: 'OTHER-001',
    domain: 'foreign', status: 'draft', screen_entry: 'src/features/foreign/screens/OTHER-001.tsx' },
  decisions([row('D-SHARED'), row('D-UNSELECTED')]));
  const options = () => ({ ...f.options(), kitRoot, layoutFile, manifestFile });
  // Synthetic declarations exercise mechanical freshness only. They do not
  // authenticate approval or create any production binding.
  const bind = (blocks, current) => {
    f.change('decision.md', ({ fm }) => { fm.decision_work_scopes = { version: 1, bindings: [{
      decision_id: 'D-SHARED', owner: OWNER, known_units: ['api', 'control', 'explicit'], blocks,
      basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:fixture-only-unverified',
    }] }; });
    if (current) {
      const { basis_digest } = resolveScopedBindingBasis({ ...options(), decisionRef: API_DECISION });
      f.change('decision.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].basis_digest = basis_digest; });
    }
  };
  return { options, bind, change: f.change, global: f.global };
}
const expectedApiDecisionApplications = () => ['api', 'explicit'].map((unit) => ({
  owner: OWNER, unit, decision: API_DECISION, referrer: API_DECISION, relation: 'selected-evidence',
}));

for (const indirect of [false, true]) test(`#355 API ${indirect ? 'transitive artifact' : 'direct'} Decision references keep unit applicability without a current binding`, (t) => {
  for (const stale of [false, true]) {
    const f = apiDecisionFixture(t, indirect);
    if (stale) f.bind([], false);
    const options = f.options(), out = resolveScopedApplicabilityProjection(options);
    assert.deepEqual(relation(out).applications, expectedApiDecisionApplications(),
      'only the explicit unit and the unit selecting the referring API row apply');
    assert.deepEqual(ids(out), ['D-SHARED'], 'an unselected API candidate cannot seed another Decision');
    const inspection = inspectScopedDecisionScopes(options);
    assert.deepEqual(inspection.blocking_units, ['api', 'explicit']);
    assert.deepEqual(inspection.unit_checks, [{ unit: 'api', decisions_clear: false },
      { unit: 'control', decisions_clear: true }, { unit: 'explicit', decisions_clear: false }]);
    assert.equal(inspection.checks[0].binding_state, stale ? 'stale-basis' : 'missing');
    assert.deepEqual(inspection.checks[0].applications, expectedApiDecisionApplications());
    assert.equal(inspection.checks[0].scope_source, 'conservative-default');
    assert.deepEqual(resolveScopedSnapshotApplicabilityProjection(options), out,
      'snapshot reuse retains the same API-to-unit association');
    assert.deepEqual(inspectScopedSnapshotDecisionScopes(options), inspection);
  }
});

test('#355 current Decision bindings still select their declared scope after API ordinary references apply', (t) => {
  for (const blocks of [['api'], ['control'], []]) {
    const f = apiDecisionFixture(t); f.bind(blocks, true);
    const options = f.options(), inspection = inspectScopedDecisionScopes(options);
    assert.deepEqual(inspection.checks[0].applications, expectedApiDecisionApplications());
    assert.equal(inspection.checks[0].binding_state, 'current-unverified');
    assert.equal(inspection.checks[0].scope_source, 'current-canonical-declaration');
    assert.equal(inspection.checks[0].declaration_scope_used, true);
    assert.deepEqual(inspection.blocking_units, blocks);
    assert.deepEqual(inspection.unit_checks, ['api', 'control', 'explicit'].map((unit) =>
      ({ unit, decisions_clear: !blocks.includes(unit) })));
    assert.equal(inspection.approval_verified, false);
    assert.equal(inspection.permission_evaluated, false);
    assert.deepEqual(inspectScopedSnapshotDecisionScopes(options), inspection);
  }
});

const API_GLOBAL_DECISION = 'decision:D-GLOBAL@open-decision-register';
const apiScope = (decision = API_DECISION) => ({ decision, owner: OWNER,
  known_units: ['api', 'control', 'explicit'], blocks: ['explicit'] });
const apiUnitChecks = (blocks) => ['api', 'control', 'explicit'].map((unit) =>
  ({ unit, decisions_clear: !blocks.includes(unit) }));
const applicationUnits = (applications, decision) => [...new Set(applications.filter((entry) =>
  entry.decision === decision && entry.owner === OWNER).map((entry) => entry.unit))].sort();

function apiMetadataDecisionFixture(t) {
  const f = apiDecisionFixture(t);
  f.change('screen.md', (doc) => {
    doc.fm.work_execution.units[0].contracts = [API_GLOBAL_DECISION];
    doc.body = doc.body.replace(`See \`${API_DECISION}\``, 'See `artifact:RULES#rules`')
      .replace('See artifact:RULES#other', 'No dependency.');
  });
  f.change('rules.md', ({ fm }) => {
    Object.assign(fm, { artifact_type: 'screen-spec', screen_id: 'OTHER-002', domain: 'foreign',
      screen_entry: 'src/features/foreign/screens/OTHER-002.tsx' });
  });
  f.global([row('D-GLOBAL')]);
  const bind = (basis_digest) => f.change('global/open-decisions.md', ({ fm }) => {
    fm.decision_work_scopes = { version: 1, bindings: [{ decision_id: 'D-GLOBAL', owner: OWNER,
      known_units: ['api', 'control', 'explicit'], blocks: ['explicit'], basis_digest,
      approval_ref: 'review:fixture-only-unverified' }] };
  });
  bind(`sha256:${'0'.repeat(64)}`);
  return { ...f, bind };
}

const apiInspectionModes = [
  ['standalone', resolveScopedApplicabilityProjection, inspectScopedDecisionScopes],
  ['snapshot', resolveScopedSnapshotApplicabilityProjection, inspectScopedSnapshotDecisionScopes],
];
for (const [mode, project, inspect] of apiInspectionModes) {
  test(`#358 API metadata Decision applications change the recorded basis and stale scope (${mode})`, (t) => {
    const f = apiMetadataDecisionFixture(t);
    const before = resolveScopedBindingBasis({ ...f.options(), decisionRef: API_GLOBAL_DECISION });
    f.bind(before.basis_digest);
    const current = inspect(f.options());
    assert.equal(current.checks[0].binding_state, 'current-unverified');
    assert.deepEqual(current.blocking_units, ['explicit']);
    assert.deepEqual(current.unit_checks, apiUnitChecks(['explicit']));
    const rules = f.options().targetIndex.artifacts.get('RULES'), originalBody = rules.body;
    // Only this external screen's metadata changes after recording a real digest.
    // Keep the complete body bytes; the general fixture writer adds a separator.
    const original = fs.readFileSync(rules.file, 'utf8'), prefix = `---\n${JSON.stringify(rules.fm)}\n---`;
    assert.ok(original.startsWith(prefix));
    fs.writeFileSync(rules.file, `---\n${JSON.stringify({ ...rules.fm, decision_refs: ['D-GLOBAL'] })}\n---${original.slice(prefix.length)}`);
    const options = f.options(), out = project(options);
    assert.equal(options.targetIndex.artifacts.get('RULES').body, originalBody);
    const after = resolveScopedBindingBasis({ ...options, decisionRef: API_GLOBAL_DECISION });
    const projected = scopedBindingBasis(out.projection, apiScope(API_GLOBAL_DECISION));
    const stale = inspect(options);
    assert.deepEqual({
      applications: applicationUnits(relation(out).applications, API_GLOBAL_DECISION),
      basisApplications: applicationUnits(after.basis.decision_relations.applications, API_GLOBAL_DECISION),
      digestChanged: after.basis_digest !== before.basis_digest,
      bindingState: stale.checks[0].binding_state, blockingUnits: stale.blocking_units,
      unitChecks: stale.unit_checks,
    }, { applications: ['api', 'explicit'], basisApplications: ['api', 'explicit'], digestChanged: true,
      bindingState: 'stale-basis', blockingUnits: ['api', 'explicit'], unitChecks: apiUnitChecks(['api', 'explicit']) });
    assert.deepEqual(projected.basis, after.basis, 'snapshot and standalone basis retain the same per-unit relation context');
    assert.equal(projected.basis_digest, after.basis_digest);
    assert.equal(stale.checks[0].computed_basis_digest, after.basis_digest);
    assert.equal(stale.checks[0].scope_source, 'conservative-default');
    assert.deepEqual(stale.checks[0].applications, relation(out).applications);
    f.bind(after.basis_digest);
    const refreshed = inspect(f.options());
    assert.equal(refreshed.checks[0].binding_state, 'current-unverified');
    assert.equal(refreshed.checks[0].scope_source, 'current-canonical-declaration');
    assert.deepEqual(refreshed.blocking_units, ['explicit']);
    assert.deepEqual(refreshed.unit_checks, apiUnitChecks(['explicit']));
  });

  test(`#358 pre-355 canonical API binding becomes stale on upgrade (${mode})`, (t) => {
    const f = apiDecisionFixture(t); f.bind(['explicit'], false);
    // Computed by the actual 8a66aa66c21d987202f27443ad10b2458cb5d992 payload,
    // using exactly apiDecisionFixture(t, false) and blocks: ['explicit'].
    // That runtime included only the explicit unit's application in this basis.
    // This is a recorded historical value, never recomputed by the tested runtime.
    const legacyDigest = 'sha256:d970ee6073cea81fb17baf0df221dadd774de74f22d973bd86a9963ef33df19b';
    f.change('decision.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].basis_digest = legacyDigest; });
    const options = f.options(), out = project(options), inspection = inspect(options);
    const current = resolveScopedBindingBasis({ ...options, decisionRef: API_DECISION });
    assert.equal(current.recorded_binding.basis_digest, legacyDigest);
    assert.equal(current.component_digests.units, 'sha256:637f448e1db3922b7c3ba34a715555e22caa063e2b914480acc1fead3bee315c',
      'unit facts must match the historical fixture; restored API relations must cause the stale digest');
    assert.deepEqual({ applications: relation(out).applications,
      basisApplications: current.basis.decision_relations.applications,
      digestChanged: current.basis_digest !== legacyDigest,
      bindingState: inspection.checks[0].binding_state, blockingUnits: inspection.blocking_units,
      unitChecks: inspection.unit_checks,
    }, { applications: expectedApiDecisionApplications(), basisApplications: expectedApiDecisionApplications(),
      digestChanged: true, bindingState: 'stale-basis', blockingUnits: ['api', 'explicit'],
      unitChecks: apiUnitChecks(['api', 'explicit']) });
    assert.equal(inspection.checks[0].scope_source, 'conservative-default');
    assert.equal(inspection.checks[0].computed_basis_digest, current.basis_digest);
    assert.deepEqual(scopedBindingBasis(out.projection, apiScope()).basis, current.basis);
  });
}

test('#358 API unit provenance survives shallow projections and rejects detached JSON copies', (t) => {
  const f = apiDecisionFixture(t); f.bind(['explicit'], false);
  const { projection } = resolveScopedApplicabilityProjection(f.options());
  const expected = scopedBindingBasis(projection, apiScope());
  assert.deepEqual(scopedBindingBasis({ ...projection }, apiScope()), expected);
  for (const detached of [structuredClone(projection), JSON.parse(JSON.stringify(projection))]) {
    assert.throws(() => scopedBindingBasis(detached, apiScope()), /API rows.*resolved unit context/);
  }
});

test('D decisions: actual local/global rows and every declared unit, without a digest or permit', (t) => {
  const f = fixture(t); f.global();
  f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ['D-GLOBAL']; doc.fm.work_execution.units.push(unit('second'));
    doc.body += `\n\n${decisions([row('D-LOCAL')])}`;
  });
  const before = [...f.docs.values()].map((file) => fs.readFileSync(file));
  const out = f.run();
  assert.deepEqual(ids(out), ['D-GLOBAL', 'D-LOCAL']);
  assert.deepEqual(out.projection.known_units, ['known', 'second']);
  assert.ok(relation(out).applications.some((entry) => entry.relation === 'local' && entry.owner === OWNER));
  for (const key of ['basis_digest', 'basis_version', 'ready', 'allowed', 'approval_ref']) {
    assert.equal(Object.hasOwn(out, key), false); assert.equal(Object.hasOwn(out.projection, key), false);
  }
  assert.deepEqual([...f.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D decisions: surface and all selected hosts retain global and local applications', (t) => {
  const f = fixture(t); f.global(); const owner = surface(f, { adopted: true });
  f.change('second.md', (doc) => { doc.body += `\n\n${decisions([row('D-HOST')])}`; });
  const out = f.run(owner);
  assert.deepEqual(ids(out), ['D-GLOBAL', 'D-HOST']);
  const applied = relation(out).applications.filter((entry) => entry.decision === 'decision:D-GLOBAL@open-decision-register');
  assert.deepEqual([...new Set(applied.map((entry) => entry.owner))].sort(), [OWNER, 'screen:RESULT-002', owner].sort());
  assert.equal(relation(out).memberships.length, 2);
  assert.ok(relation(out).applications.some((entry) => entry.owner === 'screen:RESULT-002' && entry.decision.includes('D-HOST')));
});

test('D decisions: a screen receives surface fan-out without borrowing the other host local decisions', (t) => {
  const f = fixture(t); f.global(); surface(f);
  f.change('second.md', (doc) => { doc.body += `\n\n${decisions([row('D-OTHER-HOST')])}`; });
  const before = f.run(); assert.deepEqual(ids(before), ['D-GLOBAL']);
  f.change('second.md', (doc) => { doc.body = doc.body.replace('Choose behavior.', 'Different host choice.'); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.notDeepEqual(after.read_set, before.read_set);
});

test('D decisions: native screen/surface and surface/surface duplicate application is not deduplicated into validity', (t) => {
  for (const direct of [true, false]) {
    const f = fixture(t); f.global(); surface(f);
    if (direct) f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
    else surface(f, { id: 'SECOND-SURFACE' });
    assert.throws(() => f.run(), /duplicate native decision application/);
  }
});

test('D decisions: native refs are exact global IDs, not local rows, typed aliases or repaired strings', (t) => {
  for (const refs of [null, 'D-GLOBAL', ['D-GLOBAL', 'D-GLOBAL'], [' D-GLOBAL'], ['decision:D-GLOBAL@open-decision-register'], ['D-MISSING']]) {
    const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = refs; });
    assert.throws(() => f.run());
  }
  const f = fixture(t); f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ['D-LOCAL']; doc.body += `\n\n${decisions([row('D-LOCAL')])}`;
  });
  assert.throws(() => f.run(), /artifact|missing/i);
});

test('D decisions: duplicate IDs across actual local/global homes remain ambiguous', (t) => {
  const f = fixture(t); f.global([row('D-SAME')]);
  f.change('screen.md', (doc) => { doc.body += `\n\n${decisions([row('D-SAME')])}`; });
  assert.throws(() => f.run(), /ambiguous decision/);
});

test('D decisions: general-contract IDs need no D- prefix; the table holding the row decides the kind (#260)', (t) => {
  const f = fixture(t); f.global([row('D-GLOBAL'), row('PANEL-OD-001')]);
  f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ['PANEL-OD-001']; doc.body += `\n\n${decisions([row('RESULT-001-D001')])}`;
  });
  const out = f.run();
  assert.deepEqual(ids(out), ['PANEL-OD-001', 'RESULT-001-D001']);
  assert.deepEqual(relation(out).records.map((record) => record.ref).sort(),
    ['decision:PANEL-OD-001@open-decision-register', 'decision:RESULT-001-D001@SCREEN-RESULT-001']);
});

test('D decisions: a local ID that cannot form a scoped reference is reported against its own table (#260)', (t) => {
  const f = fixture(t);
  f.change('screen.md', (doc) => { doc.body += `\n\n${decisions([row('D 001')])}`; });
  assert.throws(() => f.run(), (error) =>
    /local Open Decisions ID "D 001" in SCREEN-RESULT-001/.test(error.message) && !error.message.includes('decision_refs'));
});

test('D decisions: an alternative global location and a surface local home are rejected', (t) => {
  const f = fixture(t); f.global([row('D-GLOBAL')], 'elsewhere.md');
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  assert.throws(() => f.run(), /noncanonical global/);
  const g = fixture(t); g.global(); surface(g);
  g.change('PANEL.md', (doc) => { doc.body += `\n\n${decisions([row('D-SURFACE')])}`; });
  assert.throws(() => g.run(), /must not own/);
  const h = fixture(t); h.global();
  h.write('alternate.md', { artifact_id: 'ALTERNATE', artifact_type: 'open-decision-register', status: 'draft' }, decisions([row('D-ALTERNATE')]));
  h.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-ALTERNATE@ALTERNATE'; });
  assert.throws(() => h.run(), /noncanonical global/);
});

test('D decisions: malformed raw decision rows, columns, duplicate sections and table lookalikes fail closed', (t) => {
  for (const body of [
    decisions([row('D-BAD', '', 'A / B')]), decisions([row('D-BAD', 'Question?', 'A / B', 'accepted')]),
    decisions([row('**D-BAD**')]), decisions([row('D-BAD'), row('D-BAD')]),
    `## Open Decisions\n${table(headers.filter((h) => h !== 'Options'), [['D-BAD', 'Question?', 'api-integrated-ui', 'PM', 'open']])}`,
    `${decisions([row('D-ONE')])}\n\n${decisions([row('D-TWO')])}`,
    `## Open Decisions\n\n\`\`\`md\n${table(headers, [row('D-CODE')])}\n\`\`\``,
  ]) {
    const f = fixture(t); f.change('screen.md', (doc) => { doc.body = body; });
    assert.throws(() => f.run(), undefined, body);
  }
});

test('D decisions: recursive typed decision dependencies and native refs on selected contracts retain unit provenance', (t) => {
  const f = fixture(t); f.global([row('D-ONE'), row('D-TWO')]);
  f.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-ONE@open-decision-register\n\n## Other\nSee decision:D-TWO@open-decision-register'; });
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('second', ['artifact:RULES#other'])); });
  const out = f.run(); assert.deepEqual(ids(out), ['D-ONE', 'D-TWO']);
  const apps = relation(out).applications.filter((entry) => entry.relation === 'selected-evidence');
  assert.ok(apps.some((entry) => entry.unit === 'known' && entry.decision.includes('D-ONE')));
  assert.equal(apps.some((entry) => entry.unit === 'known' && entry.decision.includes('D-TWO')), false);
  f.change('rules.md', ({ fm }) => { fm.decision_refs = ['D-TWO']; });
  assert.ok(relation(f.run()).applications.some((entry) => entry.unit === 'known' && entry.relation === 'evidence-decision-ref'));
});

test('D decisions: finite decision cycles and set ordering use canonical nodes, not encounter-order roots', (t) => {
  const f = fixture(t);
  const rows = [row('D-ONE', 'See decision:D-TWO@open-decision-register'), row('D-TWO', 'See decision:D-ONE@open-decision-register')];
  f.global(rows); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE', 'D-TWO']; });
  const before = f.run(); assert.deepEqual(ids(before), ['D-ONE', 'D-TWO']);
  f.global([...rows].reverse()); f.change('screen.md', ({ fm }) => { fm.decision_refs.reverse(); });
  const after = f.run(); assert.deepEqual(after.projection, before.projection);
  assert.ok(relation(after).evidence.edges.length >= 2);
});

test('D decisions: selected question/options/mode/status change while unreferenced global rows and housekeeping stay outside scope', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run(); f.global([row('D-GLOBAL'), row('D-OTHER', 'Different unrelated question.')]);
  f.change('global/open-decisions.md', (doc) => { doc.fm.last_reviewed = '2026-09-21'; doc.body += '\n\n## Notes\nHousekeeping.'; });
  assert.deepEqual(f.run().projection, before.projection);
  for (const selected of [row('D-GLOBAL', 'Changed question.'), row('D-GLOBAL', 'Choose behavior.', 'C / D'),
    ['D-GLOBAL', 'Choose behavior.', 'A / B', 'final-fixture-ui', 'PM', 'open'], row('D-GLOBAL', 'Choose behavior.', 'A / B', 'resolved')]) {
    f.global([selected, row('D-OTHER')]); assert.notDeepEqual(f.run().projection, before.projection);
  }
});

test('D decisions: recursive Conflict/Unknown content is retained without inventing resolution or acceptance', (t) => {
  const f = fixture(t);
  f.write('context.md', { artifact_id: 'CONTEXT', artifact_type: 'domain-rules', status: 'draft', domain: 'result' },
    `## Unknowns\n${table(['ID', 'Question'], [['U-ONE', 'Unknown detail.']])}\n\n## Conflicts\n${table(['ID', 'Status', 'Details'], [['C-ONE', 'open', 'Conflicting detail.']])}`);
  f.global([row('D-GLOBAL', 'See unknown:U-ONE@CONTEXT and conflict:C-ONE@CONTEXT')]);
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run();
  assert.ok(relation(before).evidence.nodes.some((node) => node.kind === 'unknown'));
  assert.ok(relation(before).evidence.nodes.some((node) => node.kind === 'conflict'));
  f.change('context.md', (doc) => { doc.body = doc.body.replace('Unknown detail.', 'Changed unknown detail.'); });
  assert.notDeepEqual(f.run().projection, before.projection);
});

test('D decisions: binding self-fields are excluded but malformed binding syntax is not silently repaired', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const before = f.run();
  f.change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes = { version: 1, bindings: [{
    decision_id: 'D-GLOBAL', owner: OWNER, known_units: ['known'], blocks: [], basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:scope',
  }] }; });
  assert.deepEqual(f.run().projection, before.projection);
  f.change('global/open-decisions.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].extra = true; });
  assert.throws(() => f.run());
});

test('D decisions: missing selected refs and stale indexed bytes cannot produce a partial successful projection', (t) => {
  const f = fixture(t); f.global(); f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-GLOBAL']; });
  const options = f.options(); f.global([row('D-GLOBAL', 'Changed after indexing.')]);
  assert.throws(() => resolveScopedDecisionProjection(options), /indexed snapshot/);
  f.change('rules.md', (doc) => { doc.body = '## Rules\nSee decision:D-MISSING@open-decision-register'; });
  assert.throws(() => f.run());
});

test('D decisions: membership/domain errors cannot be treated as an unrelated surface', (t) => {
  for (const members of [['RESULT-001', 'RESULT-001'], ['RESULT-001', 'MISSING'], null]) {
    const f = fixture(t); f.global(); surface(f);
    f.change('PANEL.md', ({ fm }) => { fm.member_screens = members; });
    assert.throws(() => f.run());
  }
  const f = fixture(t); f.global(); surface(f);
  f.change('second.md', ({ fm }) => { fm.domain = 'elsewhere'; });
  assert.throws(() => f.run(), /domain mismatch/);
});
