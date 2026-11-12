import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { loadInputArtifact } from './input-artifact.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedDecisionBindings, inspectScopedSnapshotBindings,
  inspectScopedSnapshotDecisionBindings } from './scoped-work-bindings.mjs';
import { inspectScopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';
import { REQUIRED_ITEM_COLS } from './reconciliation-items.mjs';
import { REQUIRED_REGISTER_COLS } from './reconciliation-register.mjs';

const OWNER = 'screen:RESULT-001', SECOND = 'screen:RESULT-002';
const ROOT = 'src/features/result', HOME = 'global/open-decisions.md';
const DECISION = 'decision:D-ONE@open-decision-register';
const UNITS = ['known', 'other'];
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const row = (id = 'D-ONE', status = 'open') => [id, `Choose ${id}.`, 'A / B', 'api-integrated-ui', 'PM', status];
const body = (rows) => `## Open Decisions\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], rows)}`;
const unit = (id = 'known') => ({ id, kind: 'behavior', contracts: [`artifact:RULES#${id === 'other' ? 'other' : 'rules'}`], sources: [] });
const binding = (overrides = {}) => ({ decision_id: 'D-ONE', owner: OWNER, known_units: [...UNITS], blocks: ['other'],
  basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:unverified-fixture', ...overrides });

// Real file-backed resolvers, reused unchanged next to the shipped runtime.
// Recording a computed digest in this synthetic fixture is NOT human approval.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-bindings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  fs.mkdirSync(kitRoot);
  const policyFile = path.join(kitRoot, 'policy.yaml'), layoutFile = path.join(kitRoot, 'layout.yaml');
  const manifestFile = path.join(kitRoot, 'manifest.yaml'), overlayFile = path.join(kitRoot, 'adoption.yaml');
  const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  put(policyFile, {});
  put(overlayFile, { work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } });
  put(layoutFile, { roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } });
  put(manifestFile, { version: 1, artifacts: {} });
  const write = (name, fm, text) => {
    const file = path.join(docsDir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, md(fm, text)); docs.set(name, file); return file;
  };
  const change = (name, update) => {
    const file = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const doc = { fm: parsed.data, body: parsed.body }; update(doc); fs.writeFileSync(file, md(doc.fm, doc.body));
  };
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result',
    status: 'draft', screen_entry: `${ROOT}/screens/RESULT-001.tsx`, decision_refs: ['D-ONE'],
    work_execution: { version: 1, private_paths: { hook: [`${ROOT}/hooks/RESULT-001/**`] },
      test_paths: [`${ROOT}/tests/RESULT-001/**`], units: [unit(), unit('other')] } }, '## Notes\nOwner housekeeping.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Other\nOther contract.\n\n## Untouched\nUnselected prose.');
  write(HOME, { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
    decision_work_scopes: { version: 1, bindings: [binding()] } }, body([row(), row('D-TWO')]));
  const options = (owner = OWNER) => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, policyOverlayFile: overlayFile, layoutFile, manifestFile,
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((file) =>
      ({ file, fm: splitFrontmatter(fs.readFileSync(file, 'utf8')).data })) }) });
  const run = (owner = OWNER) => inspectScopedDecisionBindings(options(owner));
  const bind = (value) => change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings = [value]; });
  const recordDigest = (owner = OWNER, decisionRef = DECISION, home = HOME) => {
    const digest = resolveScopedBindingBasis({ ...options(owner), decisionRef }).basis_digest;
    change(home, ({ fm }) => { fm.decision_work_scopes.bindings.find((entry) =>
      entry.owner === owner && decisionRef.startsWith(`decision:${entry.decision_id}@`)).basis_digest = digest; });
    return digest;
  };
  return { root, docs, write, change, options, run, bind, recordDigest, policyFile, overlayFile, layoutFile };
}
function check(f, ref = DECISION, owner = OWNER) {
  return f.run(owner).checks.find((entry) => entry.decision === ref);
}
function blocked(result, state) {
  assert.equal(result.binding_state, state);
  assert.deepEqual(result.blocking_units, UNITS);
  assert.equal(result.scope_review_needed, true);
  assert.equal(result.approval_verified, false);
}

test('D bindings: absent declaration blocks every current owner unit', (t) => {
  const f = fixture(t); f.change(HOME, ({ fm }) => { delete fm.decision_work_scopes; });
  const result = check(f); blocked(result, 'missing');
  assert.equal(result.declared_binding, null); assert.equal(result.computed_basis_digest, null);
});

test('D bindings: empty binding collection is not an approved empty blocks list', (t) => {
  const f = fixture(t); f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings = []; });
  blocked(check(f), 'missing');
});

test('D bindings: another owner scope cannot exempt this owner', (t) => {
  const f = fixture(t); f.bind(binding({ owner: SECOND, blocks: [] })); blocked(check(f), 'missing');
});

test('D bindings: another decision scope is not borrowed or made applicable', (t) => {
  const f = fixture(t); f.bind(binding({ decision_id: 'D-TWO', blocks: [] }));
  blocked(check(f), 'missing'); assert.equal(f.run().checks.length, 1);
});

test('D bindings: mismatched recorded digest is stale without being rewritten', (t) => {
  const f = fixture(t), result = check(f); blocked(result, 'stale-basis');
  assert.notEqual(result.computed_basis_digest, result.declared_binding.basis_digest);
  assert.equal(result.declared_binding.basis_digest, binding().basis_digest);
});

test('D bindings: matching full scope remains current-unverified and blocks all units', (t) => {
  const f = fixture(t), digest = f.recordDigest(), result = check(f); blocked(result, 'current-unverified');
  assert.equal(result.computed_basis_digest, digest); assert.deepEqual(result.declared_binding.blocks, ['other']);
});

test('D bindings: explicit empty blocks cannot authenticate human scope reduction', (t) => {
  const f = fixture(t); f.bind(binding({ blocks: [] })); f.recordDigest();
  const result = check(f); blocked(result, 'current-unverified'); assert.deepEqual(result.declared_binding.blocks, []);
});

test('D bindings: a changed approval_ref neither changes scope bytes nor proves approval', (t) => {
  const f = fixture(t), digest = f.recordDigest();
  f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].approval_ref = 'https://example.invalid/approved'; });
  const result = check(f); blocked(result, 'current-unverified'); assert.equal(result.computed_basis_digest, digest);
});

test('D bindings: newly added units stale the known set and remain blocked', (t) => {
  const f = fixture(t); f.recordDigest(); f.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new')); });
  const result = check(f); assert.equal(result.binding_state, 'stale-known-units');
  assert.deepEqual(result.blocking_units, ['known', 'new', 'other']); assert.equal(result.computed_basis_digest, null);
});

test('D bindings: removed current units stale the recorded known set', (t) => {
  const f = fixture(t); f.recordDigest(); f.change('screen.md', ({ fm }) => { fm.work_execution.units.pop(); });
  const result = check(f); assert.equal(result.binding_state, 'stale-known-units');
  assert.deepEqual(result.blocking_units, ['known']); assert.equal(result.computed_basis_digest, null);
});

test('D bindings: a binding subset is stale rather than a narrowed execution target', (t) => {
  const f = fixture(t); f.bind(binding({ known_units: ['known'], blocks: [] })); blocked(check(f), 'stale-known-units');
});

test('D bindings: another known unit contract change invalidates the recorded basis', (t) => {
  const f = fixture(t); f.recordDigest();
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Other contract.', 'Changed other-unit contract.'); });
  blocked(check(f), 'stale-basis');
});

test('D bindings: kind changes are stale even with identical unit IDs', (t) => {
  const f = fixture(t); f.recordDigest(); f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].kind = 'visual'; });
  blocked(check(f), 'stale-basis');
});

test('D bindings: blocks changes are stale, including a move to empty blocks', (t) => {
  const f = fixture(t); f.recordDigest(); f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].blocks = []; });
  blocked(check(f), 'stale-basis');
});

test('D bindings: recomputing changed scope with the old approval never auto-approves it', (t) => {
  const f = fixture(t), before = f.recordDigest();
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Changed contract.'); });
  assert.notEqual(f.recordDigest(), before); const result = check(f); blocked(result, 'current-unverified');
  assert.equal(result.declared_binding.approval_ref, binding().approval_ref);
});

test('D bindings: canonical resolved Status contributes no open-decision block or permit', (t) => {
  const f = fixture(t); f.change(HOME, (doc) => { doc.body = body([row('D-ONE', 'resolved'), row('D-TWO')]); });
  const result = check(f); assert.equal(result.status, 'resolved'); assert.deepEqual(result.blocking_units, []);
  assert.equal(result.scope_review_needed, false); assert.equal(result.approval_verified, false);
  for (const key of ['ready', 'allowed', 'allowed_paths', 'execution_authorized']) assert.equal(Object.hasOwn(f.run(), key), false);
});

test('D bindings: no applicable decisions is only an empty decision-block set', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => { delete fm.decision_refs; });
  const result = f.run(); assert.deepEqual(result.checks, []); assert.deepEqual(result.blocking_units, []);
  assert.deepEqual(result.known_units, UNITS); assert.equal(Object.hasOwn(result, 'ready'), false);
});

test('D bindings: caller selections, resolved status and fabricated approvals are ignored', (t) => {
  const f = fixture(t); f.recordDigest(); const expected = f.run();
  const result = inspectScopedDecisionBindings({ ...f.options(), decisionRef: 'decision:D-TWO@open-decision-register',
    projection: {}, bindings: [], binding: binding({ blocks: [] }), known_units: ['known'], units: ['known'],
    status: 'resolved', approved: true, approval_verified: true, basis_digest: 'caller',
    verifyApproval: () => { assert.fail('caller callback must not authenticate scope'); } });
  assert.deepEqual(result, expected); assert.deepEqual(result.blocking_units, UNITS);
});

test('D bindings: local and global canonical decisions are both inspected', (t) => {
  const f = fixture(t), ref = 'decision:D-LOCAL@SCREEN-RESULT-001';
  f.change('screen.md', (doc) => { doc.fm.decision_work_scopes = { version: 1, bindings: [binding({ decision_id: 'D-LOCAL' })] };
    doc.body += `\n\n${body([row('D-LOCAL')])}`; });
  f.recordDigest(OWNER, ref, 'screen.md'); blocked(check(f, ref), 'current-unverified');
  assert.equal(f.run().checks.length, 2); assert.deepEqual(f.run().blocking_units, UNITS);
});

test('D bindings: selected evidence decisions are not limited to owner decision_refs', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => { delete fm.decision_refs; });
  f.change(HOME, ({ fm }) => { delete fm.decision_work_scopes; });
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', `See ${DECISION}`); });
  const result = check(f); blocked(result, 'missing'); assert.ok(result.applications.some((entry) => entry.unit === 'known'));
});

test('D bindings: inverse Unknown evidence discovers additional applicable decisions', (t) => {
  const f = fixture(t);
  f.write('unknown.md', { artifact_id: 'U-HOME', artifact_type: 'domain-rules', domain: 'foreign', status: 'draft' },
    `## Unknowns\n${table(['ID', 'Question'], [['U-ONE', 'See artifact:RULES#rules and decision:D-TWO@open-decision-register']])}`);
  blocked(check(f, 'decision:D-TWO@open-decision-register'), 'missing'); assert.equal(f.run().checks.length, 2);
});

test('D bindings: cyclic selected contracts retain finite decision closure', (t) => {
  const f = fixture(t);
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'See artifact:EXTRA#rules'); });
  f.write('extra.md', { artifact_id: 'EXTRA', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    `## Rules\nSee artifact:RULES#rules and ${DECISION}`);
  f.recordDigest(); const result = f.run(); assert.deepEqual(f.run(), result); blocked(check(f), 'current-unverified');
});

test('D bindings: malformed declarations fail instead of becoming absent scopes', (t) => {
  for (const update of [
    (fm) => { fm.decision_work_scopes = null; },
    (fm) => { fm.decision_work_scopes.version = 2; },
    (fm) => { fm.decision_work_scopes.bindings.push(binding()); },
    (fm) => { fm.decision_work_scopes.bindings[0].known_units.push('known'); },
    (fm) => { fm.decision_work_scopes.bindings[0].blocks = ['missing']; },
    (fm) => { delete fm.decision_work_scopes.bindings[0].blocks; },
    (fm) => { fm.decision_work_scopes.bindings[0].approval_ref = ''; },
    (fm) => { fm.decision_work_scopes.bindings[0].basis_digest = 'bad'; },
    (fm) => { fm.decision_work_scopes.bindings[0].approved = true; },
  ]) {
    const f = fixture(t); f.change(HOME, ({ fm }) => update(fm)); assert.throws(() => f.run());
  }
});

test('D bindings: malformed canonical Status is not treated as resolved', (t) => {
  const f = fixture(t); f.change(HOME, (doc) => { doc.body = body([row('D-ONE', 'closed'), row('D-TWO')]); });
  assert.throws(() => f.run());
});

test('D bindings: duplicate canonical decision homes remain an error', (t) => {
  const f = fixture(t); f.change('screen.md', (doc) => { doc.body += `\n\n${body([row()])}`; });
  assert.throws(() => f.run(), /ambiguous|duplicate|malformed/);
});

test('D bindings: stale indexed snapshots cannot supply a decision verdict', (t) => {
  const f = fixture(t), options = f.options();
  f.change(HOME, (doc) => { doc.body = body([row('D-ONE', 'resolved'), row('D-TWO')]); });
  assert.throws(() => inspectScopedDecisionBindings(options), /snapshot|changed|differ/);
});

test('D bindings: unresolved selected references are errors, not scope exemptions', (t) => {
  const f = fixture(t); f.change('screen.md', ({ fm }) => { fm.work_execution.units[0].contracts = ['artifact:MISSING']; });
  assert.throws(() => f.run());
});

test('D bindings: ownership and policy boundary changes stale the binding', (t) => {
  const f = fixture(t); f.recordDigest();
  f.change('screen.md', ({ fm }) => { fm.screen_entry = `${ROOT}/screens/Changed.tsx`; });
  blocked(check(f), 'stale-basis'); f.recordDigest();
  const policy = JSON.parse(fs.readFileSync(f.overlayFile, 'utf8')); policy.work_execution.role_limits.behavior.pop();
  fs.writeFileSync(f.overlayFile, JSON.stringify(policy)); blocked(check(f), 'stale-basis');
});

test('D bindings: unrelated content changes audit hashes, not current scope status', (t) => {
  const f = fixture(t); f.recordDigest(); const before = f.run();
  f.change('rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Changed unrelated prose.'); });
  f.change(HOME, (doc) => { doc.body = doc.body.replace('Choose D-TWO.', 'Still unrelated.'); });
  const after = f.run(); assert.deepEqual(after.checks, before.checks); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D bindings: set permutations and CRLF preserve scope without dropping audit changes', (t) => {
  const f = fixture(t); f.recordDigest(); const before = f.run();
  f.change('screen.md', ({ fm }) => { fm.work_execution.units.reverse(); });
  f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].known_units.reverse(); });
  const file = f.docs.get('rules.md'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const after = f.run(); assert.deepEqual(after.checks, before.checks); assert.notDeepEqual(after.read_set, before.read_set);
});

test('D bindings: inspection never changes decision, binding, resource bytes or creates outputs', (t) => {
  const f = fixture(t); f.recordDigest();
  const snapshot = () => fs.readdirSync(f.root, { recursive: true }).sort().map((name) => {
    const file = path.join(f.root, name), stat = fs.lstatSync(file);
    return [name, stat.mode, stat.isFile() ? fs.readFileSync(file).toString('hex') : null];
  });
  const before = snapshot(); f.run(); assert.deepEqual(snapshot(), before);
});

function mixedBindingFixture(t) {
  const f = fixture(t);
  const ids = ['D-ONE', 'D-TWO', 'D-MISSING', 'D-OLD-UNITS', 'D-RESOLVED'];
  f.change('screen.md', (doc) => {
    doc.fm.decision_refs = ids;
    doc.fm.uncertainty_work_scopes = { version: 1, bindings: [{ unknown_id: 'U-BOUND', owner: OWNER,
      known_units: [...UNITS], blocks: ['known'], basis_digest: binding().basis_digest, approval_ref: 'review:unverified-unknown' }] };
    doc.body += `\n\n## Unknowns\n${table(['ID', 'Question', 'Status'], [
      ['U-BOUND', 'Review the known behavior?', 'open'], ['U-MISSING', 'Review the other behavior?', 'open'],
    ])}`;
  });
  f.change(HOME, (doc) => {
    doc.fm.decision_work_scopes.bindings = [binding(), binding({ decision_id: 'D-TWO' }),
      binding({ decision_id: 'D-OLD-UNITS', known_units: ['known'], blocks: [] }), binding({ decision_id: 'D-RESOLVED' })];
    doc.body = body(ids.map((id) => row(id, id === 'D-RESOLVED' ? 'resolved' : 'open')));
  });
  f.recordDigest();
  return f;
}

test('#300 snapshot bindings match both standalone inspectors for mixed states and multiple bindings', (t) => {
  const f = mixedBindingFixture(t);
  const options = f.options();
  const expected = { decisions: inspectScopedDecisionBindings(options), uncertainty: inspectScopedUncertaintyScopes(options) };
  const actual = inspectScopedSnapshotBindings(options);
  assert.deepEqual(actual, expected, 'states, applications, blocks, all basis components and audit sets must match');
  assert.deepEqual(Object.fromEntries(actual.decisions.checks.map((check) => [check.decision, check.binding_state])), {
    'decision:D-MISSING@open-decision-register': 'missing',
    'decision:D-OLD-UNITS@open-decision-register': 'stale-known-units',
    'decision:D-ONE@open-decision-register': 'current-unverified',
    'decision:D-RESOLVED@open-decision-register': 'stale-basis',
    'decision:D-TWO@open-decision-register': 'stale-basis',
  });
  assert.equal(actual.uncertainty.checks.length, 2);
  assert.equal(actual.uncertainty.approval_verified, false);
  assert.deepEqual(actual.decisions.checks.find((check) => check.status === 'resolved').blocking_units, []);
});

test('#300 readiness Decision snapshot matches complete mutable results for mixed and absent bindings', (t) => {
  const f = mixedBindingFixture(t), options = f.options();
  const expected = inspectScopedDecisionBindings(options);
  const actual = inspectScopedSnapshotDecisionBindings(options);
  assert.deepEqual(actual, expected, 'retain every state, application, basis component and observation');
  assert.deepEqual(new Set(actual.checks.map((check) => check.binding_state)),
    new Set(['missing', 'stale-known-units', 'current-unverified', 'stale-basis']));
  assert.deepEqual(actual.checks.find((check) => check.status === 'resolved').blocking_units, []);
  assert.equal(actual.checks.every((check) => check.approval_verified === false), true);

  const absent = fixture(t);
  absent.change(HOME, ({ fm }) => { delete fm.decision_work_scopes; });
  assert.deepEqual(inspectScopedSnapshotDecisionBindings(absent.options()), absent.run());
  absent.change('screen.md', ({ fm }) => { delete fm.decision_refs; });
  const empty = inspectScopedSnapshotDecisionBindings(absent.options());
  assert.deepEqual(empty, absent.run());
  assert.deepEqual(empty.checks, []);
  assert.equal(Object.hasOwn(empty, 'ready'), false, 'a Decision-only observation is not execution authority');
});

test('#300 readiness Decision snapshot keeps owners, mutable results and subsequent file evaluations independent', (t) => {
  const f = fixture(t);
  const policy = JSON.parse(fs.readFileSync(f.overlayFile, 'utf8'));
  policy.work_execution.owners.push(SECOND); fs.writeFileSync(f.overlayFile, JSON.stringify(policy));
  f.write('second.md', { artifact_id: 'SCREEN-RESULT-002', artifact_type: 'screen-spec', screen_id: 'RESULT-002', domain: 'result',
    status: 'draft', screen_entry: `${ROOT}/screens/RESULT-002.tsx`, decision_refs: ['D-TWO'],
    work_execution: { version: 1, units: [unit('second')] } }, '## Notes\nAnother owner.');
  f.change(HOME, ({ fm }) => fm.decision_work_scopes.bindings.push(binding({ decision_id: 'D-TWO', owner: SECOND,
    known_units: ['second'], blocks: [] })));
  const first = inspectScopedSnapshotDecisionBindings(f.options()), before = structuredClone(first);
  const second = inspectScopedSnapshotDecisionBindings(f.options(SECOND));
  assert.deepEqual(second, f.run(SECOND));
  assert.deepEqual(second.known_units, ['second']);
  assert.deepEqual(second.checks.map((check) => check.decision), ['decision:D-TWO@open-decision-register']);
  assert.deepEqual(first, before);
  first.checks[0].declared_binding.blocks.push('caller-only'); first.read_set.length = 0;
  assert.deepEqual(inspectScopedSnapshotDecisionBindings(f.options()), before);
  f.change(HOME, (doc) => { doc.body = doc.body.replace('Choose D-ONE.', 'Changed D-ONE contract.'); });
  const changed = inspectScopedSnapshotDecisionBindings(f.options());
  assert.deepEqual(changed, f.run());
  assert.notEqual(changed.checks[0].computed_basis_digest, before.checks[0].computed_basis_digest);
});

test('#300 snapshot bindings keep owners and successive reports independent', (t) => {
  const f = fixture(t);
  const policy = JSON.parse(fs.readFileSync(f.overlayFile, 'utf8'));
  policy.work_execution.owners.push(SECOND); fs.writeFileSync(f.overlayFile, JSON.stringify(policy));
  f.write('second.md', { artifact_id: 'SCREEN-RESULT-002', artifact_type: 'screen-spec', screen_id: 'RESULT-002', domain: 'result',
    status: 'draft', screen_entry: `${ROOT}/screens/RESULT-002.tsx`, decision_refs: ['D-TWO'],
    work_execution: { version: 1, units: [unit('second')] } }, '## Notes\nAnother owner.');
  f.change(HOME, ({ fm }) => fm.decision_work_scopes.bindings.push(binding({ decision_id: 'D-TWO', owner: SECOND,
    known_units: ['second'], blocks: [] })));
  const first = inspectScopedSnapshotBindings(f.options()), firstValue = structuredClone(first);
  const second = inspectScopedSnapshotBindings(f.options(SECOND));
  assert.deepEqual(second, { decisions: inspectScopedDecisionBindings(f.options(SECOND)),
    uncertainty: inspectScopedUncertaintyScopes(f.options(SECOND)) });
  assert.deepEqual(second.decisions.known_units, ['second']);
  assert.deepEqual(second.decisions.checks.map((check) => check.decision), ['decision:D-TWO@open-decision-register']);
  assert.deepEqual(first, firstValue, 'checking another owner must not mutate the first report');
  first.decisions.checks[0].declared_binding.blocks.push('caller-only');
  first.uncertainty.known_units.push('caller-only');
  assert.deepEqual(inspectScopedSnapshotBindings(f.options()), firstValue, 'returned mutable objects cannot poison a later report');
  f.change(HOME, (doc) => { doc.body = doc.body.replace('Choose D-ONE.', 'Choose a changed D-ONE.'); });
  const changed = inspectScopedSnapshotBindings(f.options());
  assert.notEqual(changed.decisions.checks[0].computed_basis_digest, firstValue.decisions.checks[0].computed_basis_digest);
});

test('#300 snapshot binding inspection cannot accept a caller projection or approval as authority', (t) => {
  const f = fixture(t);
  assert.throws(() => inspectScopedSnapshotBindings({ ...f.options(), projection: {}, blocks: [], approved: true }),
    /caller projection is not authority/);
});

for (const target of ['decision home', 'contract', 'policy']) {
  test(`#300 snapshot bindings re-read ${target} after computing the binding basis`, (t) => {
    const f = fixture(t), options = f.options(), from = Buffer.from;
    const file = target === 'decision home' ? f.docs.get(HOME) : target === 'contract' ? f.docs.get('rules.md') : f.policyFile;
    let changed = false;
    // The first scope-basis-v2 serialization occurs after the canonical
    // projection and binding home have been read. Mutate only at that point,
    // so an early validation cannot substitute for the report's final audit.
    const fromMock = t.mock.method(Buffer, 'from', function (value, ...args) {
      const out = from.call(this, value, ...args);
      if (!changed && typeof value === 'string' && value.startsWith('{"basis_version":2,"binding":')) {
        changed = true; fs.appendFileSync(file, '\nchanged after basis input was captured\n');
      }
      return out;
    });
    try {
      assert.throws(() => inspectScopedSnapshotBindings(options), /SW-BINDINGS: snapshot changed while inspecting bindings/);
      assert.equal(changed, true);
    } finally { fromMock.mock.restore(); }
  });
}

function optionalRegister(f, kind = 'typed') {
  const inputId = 'IN-20260922-meeting-001';
  const inputFile = path.join(f.root, 'docs', 'input.md');
  fs.writeFileSync(inputFile, md({ input_id: inputId, input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:relations',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured', affected_domains: ['result'], affected_screens: ['RESULT-001'] },
  '## Extracted Facts\n- Known fact.'));
  f.change('rules.md', (doc) => {
    if (kind === 'native') doc.fm.sources = [{ type: 'meeting', ref: inputId }];
    else doc.body = doc.body.replace('Known contract.', `Known contract. See input:${inputId}#extracted-facts/01`);
  });
  const registerFile = path.join(f.root, 'docs', 'register.md');
  return { registerFile, options: { ...f.options(), inputArtifacts: [loadInputArtifact(inputFile)], registerFile } };
}

test('#300 mutable standalone bindings still detect an optional register appearing between basis passes', (t) => {
  const f = fixture(t), { registerFile, options } = optionalRegister(f);
  const open = fs.openSync;
  let appeared = false;
  // The binding-home read sits between the initial canonical projection and
  // the standalone inspector's independent basis pass. No existing file hash
  // can reveal a previously absent optional register appearing at this point.
  const openMock = t.mock.method(fs, 'openSync', function (file, ...args) {
    const fd = open.call(this, file, ...args);
    if (!appeared && file === f.docs.get(HOME) && new Error().stack.includes(' at bindings (')) {
      appeared = true;
      fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
        structured_since: '2026-09-01T00:00:00Z' }, 'Malformed register created after applicability.'));
    }
    return fd;
  });
  try {
    assert.throws(() => inspectScopedDecisionBindings(options), /RR-SCHEMA-004.*RR-SCHEMA-019/s);
    assert.equal(appeared, true);
  } finally { openMock.mock.restore(); }
});

for (const { kind, symlink = false } of [{ kind: 'typed' }, { kind: 'native' }, { kind: 'typed', symlink: true }]) {
  test(`#300 snapshot bindings preserve an absent register dependency inferred from ${kind} input references${symlink ? ' when a symlink appears' : ''}`,
    { skip: symlink && process.platform === 'win32' }, (t) => {
    const f = fixture(t), { registerFile, options } = optionalRegister(f, kind), from = Buffer.from;
    if (kind === 'native') options.registerFile = 'docs/register.md';
    const stable = inspectScopedSnapshotBindings(options);
    assert.ok(!stable.decisions.read_set.some((entry) => entry.file === 'docs/register.md'));
    let appeared = false;
    const fromMock = t.mock.method(Buffer, 'from', function (value, ...args) {
      const out = from.call(this, value, ...args);
      if (!appeared && typeof value === 'string' && value.startsWith('{"basis_version":2,"binding":')) {
        appeared = true;
        if (symlink) fs.symlinkSync(f.docs.get('rules.md'), registerFile, 'file');
        else fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
          structured_since: '2026-09-01T00:00:00Z' }, 'Appeared after canonical applicability was resolved.'));
      }
      return out;
    });
    try {
      assert.throws(() => inspectScopedSnapshotBindings(options), symlink ? /symlink/ : /register appeared/);
      assert.equal(appeared, true);
    } finally { fromMock.mock.restore(); }
  });
}

test('#300 snapshot bindings do not inspect a register path that no unit consulted', (t) => {
  const f = fixture(t), options = { ...f.options(), registerFile: '../unused-register.md' };
  assert.deepEqual(inspectScopedSnapshotBindings(options), {
    decisions: inspectScopedDecisionBindings(options), uncertainty: inspectScopedUncertaintyScopes(options),
  });
});

function inverseQuestion(f) {
  return f.write('question.md', { artifact_id: 'QUESTIONS', artifact_type: 'domain-rules', domain: 'foreign', status: 'draft' },
    `## Unknowns\n${table(['ID', 'Question', 'Status'], [
      ['U-CHECK', 'See artifact:RULES#rules and decision:D-ONE@open-decision-register', 'open'],
    ])}`);
}

// This direct uncertainty read occurs after its first unit pass and creates a
// dependency root for the next pass. Lower Decision reads are not the boundary.
function afterFirstUncertaintyRead(t, question, change, restore) {
  const open = fs.openSync;
  const state = { changed: false, restored: false };
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    const fd = open.call(this, file, ...args);
    if (file === question && (!state.changed || (restore && !state.restored))) {
      const stack = new Error().stack;
      if (stack.includes('at document (') && stack.includes('scoped-work-uncertainty.mjs') && !stack.includes('scoped-work-decisions.mjs')) {
        if (!state.changed) { state.changed = true; change(); }
        else { state.restored = true; restore(); }
      }
    }
    return fd;
  });
  return { state, restore: () => hook.mock.restore() };
}

for (const kind of ['typed', 'native']) {
  test(`#300 snapshot unit reuse observes an absent ${kind} register before the next relation pass`, (t) => {
    const f = fixture(t), question = inverseQuestion(f);
    const { registerFile, options } = optionalRegister(f, kind);
    if (kind === 'native') options.registerFile = 'docs/register.md';
    const mutation = afterFirstUncertaintyRead(t, question, () => {
      fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
        structured_since: '2026-09-01T00:00:00Z' }, 'Malformed register appeared between unit passes.'));
    }, () => fs.unlinkSync(registerFile));
    // A final-only absence check misses a register removed in the next pass.
    // The original independent unit pass rejects its malformed contents first.
    try {
      assert.throws(() => inspectScopedSnapshotBindings(options), /register appeared|RR-SCHEMA-004.*RR-SCHEMA-019/s);
      assert.equal(mutation.state.changed, true);
      assert.equal(mutation.state.restored, false, 'reject the changed observation before the next relation pass');
    } finally { mutation.restore(); }
  });
}

test('#300 snapshot unit reuse retains register absence when a later unit observes the file', (t) => {
  const f = fixture(t), { registerFile, options } = optionalRegister(f, 'native');
  const selected = options.inputArtifacts[0].fm.input_id;
  const register = md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1', structured_since: '2026-09-01T00:00:00Z' },
    `${table(REQUIRED_REGISTER_COLS, [
      [selected, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:RULES', '-', '-'],
    ])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, [
      [selected, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES', `input:${selected}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
    ])}`);
  let appeared = false;
  const open = fs.openSync, stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 30;
  const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
    if (!appeared && file === f.docs.get('screen.md')) {
      const stack = new Error().stack;
      // The unit's own API analysis follows its source closure. Insert the
      // register after unit one observed absence and before unit two reads it.
      if (stack.includes('scoped-work-api.mjs') && stack.includes('resolveScopedUnitProjection') && !stack.includes('resolveSourceClosure')) {
        appeared = true; fs.writeFileSync(registerFile, register);
      }
    }
    return open.call(this, file, ...args);
  });
  try {
    assert.throws(() => inspectScopedSnapshotBindings(options), /register (?:appeared|changed)|unit projection changed|snapshot changed/i);
    assert.equal(appeared, true);
  } finally { hook.mock.restore(); Error.stackTraceLimit = stackTraceLimit; }
});

test('#300 snapshot unit reuse rechecks a present unit resource between relation passes', (t) => {
  const f = fixture(t), question = inverseQuestion(f), options = f.options();
  const original = fs.readFileSync(f.policyFile);
  const mutation = afterFirstUncertaintyRead(t, question,
    () => fs.appendFileSync(f.policyFile, '\n# changed between unit passes\n'),
    () => fs.writeFileSync(f.policyFile, original));
  try {
    assert.throws(() => inspectScopedSnapshotBindings(options), /changed|differs|snapshot/i);
    assert.equal(mutation.state.changed, true);
    assert.equal(mutation.state.restored, false, 'a final audit cannot replace the check before the next relation pass');
  } finally { mutation.restore(); }
});

test('#300 snapshot unit reuse rechecks the canonical layout before the next relation pass', (t) => {
  const f = fixture(t), question = inverseQuestion(f), options = f.options();
  const original = fs.readFileSync(f.layoutFile);
  const mutation = afterFirstUncertaintyRead(t, question,
    () => fs.appendFileSync(f.layoutFile, '\n# changed between relation passes\n'),
    () => fs.writeFileSync(f.layoutFile, original));
  try {
    assert.throws(() => inspectScopedSnapshotBindings(options), /layout changed|snapshot changed/i);
    assert.equal(mutation.state.changed, true);
    assert.equal(mutation.state.restored, false);
  } finally { mutation.restore(); }
});

test('#300 snapshot unit reuse retains validation reads of an unselected input Evidence body', (t) => {
  const f = fixture(t), question = inverseQuestion(f);
  const { registerFile, options } = optionalRegister(f);
  const selected = options.inputArtifacts[0].fm.input_id, unrelated = 'IN-20260922-meeting-002';
  const file = path.join(f.root, 'unselected-input.md');
  fs.writeFileSync(file, md({ ...options.inputArtifacts[0].fm, input_id: unrelated, source_ref: 'meeting:unselected' },
    '## Extracted Facts\n- A rejected but validated fact.'));
  options.inputArtifacts.push(loadInputArtifact(file));
  fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-09-01T00:00:00Z' }, `${table(REQUIRED_REGISTER_COLS, [
    [selected, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:RULES', '-', '-'],
    [unrelated, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-'],
  ])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, [
    [selected, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES#rules', `input:${selected}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
    [unrelated, '01', 'reject', 'reject-input', 'reject', '-', `input:${unrelated}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
  ])}`));
  const stable = inspectScopedSnapshotBindings(options);
  assert.equal(stable.decisions.read_set.some((entry) => entry.file === 'unselected-input.md'), false,
    'validation-only input text must not become selected evidence or change the public read set');
  const raw = fs.readFileSync(file, 'utf8');
  const mutation = afterFirstUncertaintyRead(t, question, () => fs.writeFileSync(file,
    raw.replace('## Extracted Facts', '## Removed Facts')), () => fs.writeFileSync(file, raw));
  try {
    assert.throws(() => inspectScopedSnapshotBindings(options), /RR-REF-005|changed|snapshot/i);
    assert.equal(mutation.state.changed, true);
    assert.equal(mutation.state.restored, false, 'check validation observations before reuse, not only after closure');
  } finally { mutation.restore(); }
});

test('#300 snapshot unit reuse does not observe an input file whose body was never consulted', (t) => {
  const f = fixture(t), question = inverseQuestion(f), file = path.join(f.root, 'unused-input.md');
  const options = { ...f.options(), inputArtifacts: [{ file, hasFrontmatter: true, fm: {
    input_id: 'IN-20260922-meeting-999', input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:unused',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'],
  } }] };
  const expected = { decisions: inspectScopedDecisionBindings(options), uncertainty: inspectScopedUncertaintyScopes(options) };
  const mutation = afterFirstUncertaintyRead(t, question, () => fs.writeFileSync(file, 'An unused file appeared.'));
  try {
    assert.deepEqual(inspectScopedSnapshotBindings(options), expected);
    assert.equal(mutation.state.changed, true);
    assert.equal(expected.decisions.read_set.some((entry) => entry.file === 'unused-input.md'), false);
  } finally { mutation.restore(); }
});

// This is after applicability and the canonical binding home have been read.
// A second serialization can restore a transient edit, so a final-only check
// cannot substitute for checking the observation before the next basis reuse.
function afterFirstDecisionBasis(t, change, restore) {
  const from = Buffer.from, state = { changed: false, restored: false };
  const hook = t.mock.method(Buffer, 'from', function (value, ...args) {
    const result = from.call(this, value, ...args);
    if (typeof value === 'string' && value.startsWith('{"basis_version":2,"binding":')) {
      if (!state.changed) { state.changed = true; change(); }
      else if (restore && !state.restored) { state.restored = true; restore(); }
    }
    return result;
  });
  return { state, restore: () => hook.mock.restore() };
}

for (const target of ['decision home', 'contract', 'policy']) {
  test(`#300 readiness Decision snapshot rechecks ${target} after basis capture`, (t) => {
    const f = fixture(t), options = f.options();
    const file = target === 'decision home' ? f.docs.get(HOME) : target === 'contract' ? f.docs.get('rules.md') : f.policyFile;
    const mutation = afterFirstDecisionBasis(t, () => fs.appendFileSync(file, '\nchanged after basis capture\n'));
    try {
      assert.throws(() => inspectScopedSnapshotDecisionBindings(options), /changed|differs|snapshot/i);
      assert.equal(mutation.state.changed, true);
    } finally { mutation.restore(); }
  });
}

for (const kind of ['typed', 'native']) {
  test(`#300 readiness Decision snapshot retains absent ${kind} registers through binding evaluation`, (t) => {
    const f = fixture(t), { registerFile, options } = optionalRegister(f, kind);
    if (kind === 'native') options.registerFile = 'docs/register.md';
    const expected = inspectScopedDecisionBindings(options);
    assert.deepEqual(inspectScopedSnapshotDecisionBindings(options), expected);
    assert.equal(expected.read_set.some((entry) => entry.file === 'docs/register.md'), false);
    const mutation = afterFirstDecisionBasis(t, () => fs.writeFileSync(registerFile, 'Appeared after applicability.'));
    try {
      assert.throws(() => inspectScopedSnapshotDecisionBindings(options), /register appeared|snapshot changed/i);
      assert.equal(mutation.state.changed, true);
    } finally { mutation.restore(); }
  });
}

test('#300 readiness Decision snapshot rejects a policy edit before another binding can reuse the projection', (t) => {
  const f = fixture(t);
  f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE', 'D-TWO']; });
  f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings.push(binding({ decision_id: 'D-TWO' })); });
  const options = f.options(), original = fs.readFileSync(f.policyFile);
  const mutation = afterFirstDecisionBasis(t, () => fs.appendFileSync(f.policyFile, '\n# temporary change\n'),
    () => fs.writeFileSync(f.policyFile, original));
  try {
    assert.throws(() => inspectScopedSnapshotDecisionBindings(options), /changed|differs|snapshot/i);
    assert.equal(mutation.state.changed, true);
    assert.equal(mutation.state.restored, false, 'reject before computing the next binding basis');
  } finally { mutation.restore(); }
});

for (const transient of [false, true]) {
  test(`#300 readiness Decision snapshot retains validation-only input reads ${transient ? 'before the next binding' : 'through publication'}`, (t) => {
    const f = fixture(t);
    if (transient) {
      f.change('screen.md', ({ fm }) => { fm.decision_refs = ['D-ONE', 'D-TWO']; });
      f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings.push(binding({ decision_id: 'D-TWO' })); });
    }
    const { registerFile, options } = optionalRegister(f);
    const selected = options.inputArtifacts[0].fm.input_id, unrelated = 'IN-20260922-meeting-002';
    const file = path.join(f.root, 'unselected-input.md');
    fs.writeFileSync(file, md({ ...options.inputArtifacts[0].fm, input_id: unrelated, source_ref: 'meeting:unselected' },
      '## Extracted Facts\n- A rejected but validated fact.'));
    options.inputArtifacts.push(loadInputArtifact(file));
    fs.writeFileSync(registerFile, md({ reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
      structured_since: '2026-09-01T00:00:00Z' }, `${table(REQUIRED_REGISTER_COLS, [
      [selected, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:RULES', '-', '-'],
      [unrelated, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-'],
    ])}\n\n## Reconciliation Items\n${table(REQUIRED_ITEM_COLS, [
      [selected, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:RULES#rules', `input:${selected}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
      [unrelated, '01', 'reject', 'reject-input', 'reject', '-', `input:${unrelated}#extracted-facts/01`, 'inherit', 'statement', 'inherit'],
    ])}`));
    const expected = inspectScopedDecisionBindings(options);
    assert.deepEqual(inspectScopedSnapshotDecisionBindings(options), expected);
    assert.equal(expected.read_set.some((entry) => entry.file === 'unselected-input.md'), false,
      'validation-only text stays out of public authority and basis fields');
    const raw = fs.readFileSync(file, 'utf8');
    const mutation = afterFirstDecisionBasis(t, () => fs.writeFileSync(file, raw.replace('## Extracted Facts', '## Removed Facts')),
      transient ? () => fs.writeFileSync(file, raw) : undefined);
    try {
      assert.throws(() => inspectScopedSnapshotDecisionBindings(options), /RR-REF-005|changed|snapshot/i);
      assert.equal(mutation.state.changed, true);
      assert.equal(mutation.state.restored, false, 'private validation reads must be checked before reuse or publication');
    } finally { mutation.restore(); }
  });
}

test('#300 readiness Decision snapshot does not promote an unread input body to authority', (t) => {
  const f = fixture(t), file = path.join(f.root, 'unused-input.md');
  const options = { ...f.options(), inputArtifacts: [{ file, hasFrontmatter: true, fm: {
    input_id: 'IN-20260922-meeting-999', input_type: 'meeting', source_type: 'meeting', source_ref: 'meeting:unused',
    captured_at: '2026-09-22T00:00:00Z', captured_by: 'test', status: 'captured',
    affected_domains: ['result'], affected_screens: ['RESULT-001'],
  } }] };
  const expected = inspectScopedDecisionBindings(options);
  const mutation = afterFirstDecisionBasis(t, () => fs.writeFileSync(file, 'Unconsulted bytes appeared.'));
  try {
    assert.deepEqual(inspectScopedSnapshotDecisionBindings(options), expected);
    assert.equal(mutation.state.changed, true);
    assert.equal(expected.read_set.some((entry) => entry.file === 'unused-input.md'), false);
  } finally { mutation.restore(); }
});
