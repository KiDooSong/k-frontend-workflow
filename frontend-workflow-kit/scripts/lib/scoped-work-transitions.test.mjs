import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';
import { inspectScopedDecisionTransitions } from './scoped-work-transitions.mjs';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-transitions-'));
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

// Each side has independent actual bytes and a freshly built canonical index.
// Matching synthetic fixture digests are not human approvals or Git attestations.
function pair(t, setup = () => {}) {
  const before = fixture(t), after = fixture(t);
  for (const side of [before, after]) { setup(side); side.recordDigest(); }
  return { before, after, run: (extra = {}) => inspectScopedDecisionTransitions({
    owner: OWNER, before: before.options(), after: after.options(), ...extra }) };
}
const status = (f, value) => f.change(HOME, (doc) => { doc.body = body([row('D-ONE', value), row('D-TWO')]); });
const unbind = (f) => f.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings = []; });
const codes = (result) => result.violations.map((entry) => entry.code);
const transition = (result, ref = DECISION) => result.transitions.find((entry) => entry.decision === ref);
const noPermit = (result) => {
  assert.equal(result.approval_verified, false);
  for (const key of ['ready', 'allowed', 'approved', 'effective_binding', 'allowed_paths']) assert.equal(Object.hasOwn(result, key), false);
};

test('D transitions: identical independent snapshots retain conservative blocking and never grant', (t) => {
  const p = pair(t), before = [...p.before.docs.values(), ...p.after.docs.values()].map((file) => fs.readFileSync(file));
  const result = p.run();
  assert.equal(result.scope_changed, false); assert.equal(result.known_units_changed, false);
  assert.equal(result.review_required, false); assert.deepEqual(result.violations, []);
  assert.equal(transition(result).binding_change, 'unchanged'); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
  assert.deepEqual([...p.before.docs.values(), ...p.after.docs.values()].map((file) => fs.readFileSync(file)), before);
});

test('D transitions: selected content change leaves an unchanged binding stale rather than refreshing it', (t) => {
  const p = pair(t); p.after.change('rules.md', (doc) => { doc.body = doc.body.replace('Other contract.', 'Changed contract.'); });
  const result = p.run(); assert.equal(result.scope_changed, true); assert.equal(result.review_required, true);
  assert.equal(transition(result).after_binding_state, 'stale-basis'); assert.deepEqual(result.violations, []);
  assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: refreshed digest with the old approval ref is flagged', (t) => {
  const p = pair(t); p.after.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Changed contract.'); });
  p.after.recordDigest(); const result = p.run();
  assert.ok(codes(result).includes('approval-ref-reused-with-changed-binding'));
  assert.equal(transition(result).after_binding_state, 'current-unverified'); assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: a new approval string and current digest still require human verification', (t) => {
  const p = pair(t); p.after.change('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Changed contract.'); });
  p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].approval_ref = 'review:new-but-unverified'; });
  p.after.recordDigest(); const result = p.run();
  assert.deepEqual(result.violations, []); assert.equal(result.review_required, true); noPermit(result);
  assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: changing only approval_ref does not change scope or authenticate review', (t) => {
  const p = pair(t); p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].approval_ref = 'review:different'; });
  const result = p.run(); assert.equal(result.scope_changed, false); assert.equal(result.review_required, true);
  assert.deepEqual(result.violations, []); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

for (const kind of ['added', 'removed']) test(`D transitions: ${kind} owner units stale the known set without a target subset escape`, (t) => {
  const p = pair(t); p.after.change('screen.md', ({ fm }) => {
    if (kind === 'added') fm.work_execution.units.push(unit('new')); else fm.work_execution.units.pop();
  });
  const result = p.run({ units: ['known'] }); assert.equal(result.known_units_changed, true);
  assert.equal(transition(result).after_binding_state, 'stale-known-units');
  assert.deepEqual(result.blocking_units, kind === 'added' ? ['known', 'new', 'other'] : ['known']); noPermit(result);
});

test('D transitions: a rewritten known set with reused approval cannot adopt a newly added unit', (t) => {
  const p = pair(t); p.after.change('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new')); });
  p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].known_units.push('new'); });
  p.after.recordDigest(); const result = p.run();
  assert.ok(codes(result).includes('approval-ref-reused-with-changed-binding'));
  assert.deepEqual(result.blocking_units, ['known', 'new', 'other']);
});

test('D transitions: empty blocks with refreshed digest and old approval remains invalid for adoption', (t) => {
  const p = pair(t); p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].blocks = []; });
  p.after.recordDigest(); const result = p.run();
  assert.ok(codes(result).includes('approval-ref-reused-with-changed-binding')); assert.deepEqual(result.blocking_units, UNITS);
});

for (const replace of [false, true]) test(`D transitions: reopen retains no binding even with ${replace ? 'new digest/ref' : 'unchanged old scope'}`, (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open');
  if (replace) {
    p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].approval_ref = 'review:replacement'; });
    p.after.recordDigest();
  }
  const result = p.run(); assert.equal(transition(result).reopened, true);
  assert.ok(codes(result).includes('reopen-binding-retained')); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: reopen with all decision bindings removed is conservative, not an approval', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open'); unbind(p.after);
  const result = p.run(); assert.deepEqual(result.violations, []); assert.equal(transition(result).reopened, true);
  assert.equal(transition(result).binding_change, 'removed'); assert.equal(transition(result).after_binding_state, 'missing');
  assert.equal(result.review_required, true); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: reopen requires removing another owner binding too', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open');
  p.after.bind(binding({ owner: SECOND, blocks: [] }));
  const result = p.run(), finding = result.violations.find((entry) => entry.code === 'reopen-binding-retained');
  assert.deepEqual(finding.owners, [SECOND]); assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: bindings for another decision are preserved during a valid reopen', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open');
  p.after.bind(binding({ decision_id: 'D-TWO', blocks: [] }));
  const result = p.run(); assert.deepEqual(result.violations, []);
  assert.equal(transition(result).after_binding_state, 'missing'); assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: reopen without any scope on either side stays fully blocked', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); unbind(p.before); unbind(p.after); status(p.after, 'open');
  const result = p.run(); assert.deepEqual(result.violations, []); assert.equal(transition(result).binding_change, 'absent');
  assert.equal(transition(result).reopened, true); assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: removing applicability cannot hide a simultaneous reopen with retained binding', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open');
  p.after.change('screen.md', ({ fm }) => { fm.decision_refs = []; });
  const result = p.run(); assert.equal(transition(result).after_applicable, false);
  assert.equal(transition(result).reopened, true); assert.ok(codes(result).includes('reopen-binding-retained'));
  assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: removing applicability during an unbound reopen still cannot lower blocking', (t) => {
  const p = pair(t, (side) => status(side, 'resolved')); status(p.after, 'open'); unbind(p.after);
  p.after.change('screen.md', ({ fm }) => { fm.decision_refs = []; });
  const result = p.run(); assert.equal(transition(result).after_applicable, false);
  assert.equal(transition(result).reopened, true); assert.deepEqual(result.violations, []);
  assert.equal(result.review_required, true); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: removing an open applicability edge needs review and cannot lower blocking', (t) => {
  const p = pair(t); p.after.change('screen.md', ({ fm }) => { fm.decision_refs = []; });
  const result = p.run(); assert.equal(transition(result).after_applicable, false); assert.equal(result.review_required, true);
  assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: removing a formerly applicable decision does not simulate resolution', (t) => {
  const p = pair(t); p.after.change('screen.md', ({ fm }) => { fm.decision_refs = []; });
  p.after.change(HOME, (doc) => { doc.body = body([row('D-TWO')]); delete doc.fm.decision_work_scopes; });
  const result = p.run(); assert.ok(codes(result).includes('decision-disappeared'));
  assert.equal(transition(result).after_status, null); assert.deepEqual(result.blocking_units, UNITS);
});

test('D transitions: newly applicable decision is reviewed and not approved by a binding', (t) => {
  const p = pair(t); p.before.change('screen.md', ({ fm }) => { fm.decision_refs = []; });
  p.before.change(HOME, (doc) => { doc.body = body([row('D-TWO')]); delete doc.fm.decision_work_scopes; });
  const result = p.run(); assert.equal(transition(result).before_status, null); assert.equal(transition(result).binding_change, 'added');
  assert.equal(result.review_required, true); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D transitions: canonical resolution is recorded but is not human approval or an overall permit', (t) => {
  const p = pair(t); status(p.after, 'resolved'); const result = p.run();
  assert.equal(transition(result).after_status, 'resolved'); assert.equal(result.review_required, true);
  assert.deepEqual(result.blocking_units, []); noPermit(result);
});

test('D transitions: canonical local home reopen is checked as well as global homes', (t) => {
  const p = pair(t);
  for (const side of [p.before, p.after]) {
    side.change(HOME, (doc) => { doc.body = body([row('D-TWO')]); delete doc.fm.decision_work_scopes; });
    side.change('screen.md', (doc) => { doc.fm.decision_refs = [];
      doc.fm.decision_work_scopes = { version: 1, bindings: [binding()] }; doc.body = body([row('D-ONE', 'resolved')]); });
  }
  p.after.change('screen.md', (doc) => { doc.body = body([row()]); });
  const result = p.run(), ref = 'decision:D-ONE@SCREEN-RESULT-001';
  assert.equal(transition(result, ref).reopened, true);
  assert.ok(result.violations.some((entry) => entry.code === 'reopen-binding-retained' && entry.decision === ref));
});

test('D transitions: unrelated sections and binding set order do not manufacture scope changes', (t) => {
  const p = pair(t); p.after.change('rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Changed notes.'); });
  p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes.bindings[0].known_units.reverse(); });
  const result = p.run(); assert.equal(result.scope_changed, false); assert.equal(result.review_required, false);
  assert.deepEqual(result.violations, []); assert.notDeepEqual(result.read_sets.before, result.read_sets.after);
});

test('D transitions: caller projections, statuses, decision subsets and approval callbacks are not authority', (t) => {
  const p = pair(t), expected = p.run();
  assert.deepEqual(p.run({ decisions: [], status: 'resolved', projection: {}, approved: true, approvalVerifier: () => true }), expected);
  assert.throws(() => p.run({ after: p.after.options(SECOND) }), /snapshot owner differs/);
  assert.throws(() => p.run({ before: { projection: {} } }));
});

test('D transitions: stale indexed snapshots and malformed declarations are rejected', (t) => {
  const p = pair(t), before = p.before.options();
  p.before.change('rules.md', (doc) => { doc.body += '\nChanged indexed bytes.'; });
  assert.throws(() => p.run({ before }), /snapshot|differs|changed/);
  p.after.change(HOME, ({ fm }) => { fm.decision_work_scopes = null; });
  assert.throws(() => p.run(), /decision_work_scopes/);
});

test('D transitions: a late mutation in the before tree is detected after reading the after tree', (t) => {
  const p = pair(t), file = p.before.docs.get('rules.md'), bytes = fs.readFileSync(file, 'utf8');
  const read = fs.readFileSync; let changed = false;
  t.mock.method(fs, 'readFileSync', function (target, ...args) {
    if (!changed && target === p.after.policyFile) { changed = true; fs.writeFileSync(file, bytes + '\nLate mutation.'); }
    return read.call(this, target, ...args);
  });
  assert.throws(() => p.run(), /snapshot changed/); assert.equal(changed, true);
});
