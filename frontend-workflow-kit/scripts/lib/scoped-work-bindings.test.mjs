import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';

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
  const manifestFile = path.join(kitRoot, 'manifest.yaml');
  const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  put(policyFile, { work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'],
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
  const options = (owner = OWNER) => ({ owner, projectRoot: root, docsDir, kitRoot, policyFile, layoutFile, manifestFile,
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
  return { root, docs, write, change, options, run, bind, recordDigest, policyFile };
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
  const policy = JSON.parse(fs.readFileSync(f.policyFile, 'utf8')); policy.work_execution.role_limits.behavior.pop();
  fs.writeFileSync(f.policyFile, JSON.stringify(policy)); blocked(check(f), 'stale-basis');
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
