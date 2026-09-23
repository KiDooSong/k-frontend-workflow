import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedGitDecisionScopes, inspectScopedGitDecisionTransitions } from './scoped-work-git-transitions.mjs';

const OWNER = 'screen:RESULT-001', HOME = 'global/open-decisions.md', REF = 'decision:D-ONE@open-decision-register';
const UNITS = ['known', 'other'], ROOT = 'src/features/result';
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const row = (id = 'D-ONE', status = 'open') => [id, `Choose ${id}.`, 'A / B', 'api-integrated-ui', 'PM', status];
const decisions = (rows) => `## Open Decisions\n| ID | Decision Needed | Options | Blocking Mode | Owner | Status |\n|---|---|---|---|---|---|\n${rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')}`;
const unit = (id = 'known') => ({ id, kind: 'behavior', contracts: [`artifact:RULES#${id === 'other' ? 'other' : 'rules'}`], sources: [] });

// Only isolated synthetic repositories are authored/committed here. A fixture
// approval_ref and a tool-computed digest are explicitly not human approval.
function fixture(t, { blocks = ['other'], status = 'open', absent = false, stale = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-scope-evaluation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  const file = (relative) => path.join(root, relative);
  const put = (relative, bytes) => { fs.mkdirSync(path.dirname(file(relative)), { recursive: true }); fs.writeFileSync(file(relative), bytes); };
  const write = (name, fm, body) => { put(`docs/${name}`, md(fm, body)); docs.set(name, file(`docs/${name}`)); };
  const edit = (name, update) => {
    const target = docs.get(name), parsed = splitFrontmatter(fs.readFileSync(target, 'utf8')), doc = { fm: parsed.data, body: parsed.body };
    update(doc); fs.writeFileSync(target, md(doc.fm, doc.body));
  };
  const resources = { root, owner: OWNER, docs: 'docs', kit: '.kit', policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' };
  put(resources.policy, JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['visual', 'api-contract', 'behavior'], role_limits: {
    visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'], behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
  }, deny_paths: [] } }));
  put(resources.layout, JSON.stringify({ roles: { screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'] } }));
  put(resources.manifest, JSON.stringify({ version: 1, artifacts: {} }));
  write('screen.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec', screen_id: 'RESULT-001', domain: 'result', status: 'draft',
    screen_entry: `${ROOT}/screens/RESULT-001.tsx`, decision_refs: ['D-ONE'], work_execution: { version: 1,
      private_paths: { hook: [`${ROOT}/hooks/RESULT-001/**`] }, test_paths: [`${ROOT}/tests/RESULT-001/**`], units: [unit(), unit('other')] } }, '## Notes\nOwner.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'result', status: 'confirmed' },
    '## Rules\nKnown contract.\n\n## Other\nOther contract.\n\n## Untouched\nUnselected prose.');
  write(HOME, { artifact_id: 'open-decision-register', artifact_type: 'open-decision-register', status: 'draft',
    ...(absent ? {} : { decision_work_scopes: { version: 1, bindings: [{ decision_id: 'D-ONE', owner: OWNER,
      known_units: [...UNITS], blocks, basis_digest: `sha256:${'0'.repeat(64)}`, approval_ref: 'review:fixture-only-unverified' }] } }) },
  decisions([row('D-ONE', status), row('D-TWO')]));
  const basisOptions = () => ({ owner: OWNER, projectRoot: root, docsDir, kitRoot, policyFile: file(resources.policy),
    layoutFile: file(resources.layout), manifestFile: file(resources.manifest), targetIndex: buildReconciliationTargetIndex({
      docs: [...docs.values()].map((target) => ({ file: target, fm: splitFrontmatter(fs.readFileSync(target, 'utf8')).data })),
    }) });
  const recordDigest = () => {
    const digest = resolveScopedBindingBasis({ ...basisOptions(), decisionRef: REF }).basis_digest;
    edit(HOME, ({ fm }) => { fm.decision_work_scopes.bindings.find((b) => b.decision_id === 'D-ONE' && b.owner === OWNER).basis_digest = digest; });
    return digest;
  };
  if (!absent && !stale) recordDigest();
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
  git('init', '-q'); git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0'); git('config', 'user.email', 'scoped-test@example.invalid'); git('config', 'user.name', 'Scoped Test');
  git('config', 'core.autocrlf', 'false'); git('config', 'core.filemode', 'true'); git('add', '--', '.kit', 'docs'); git('commit', '-qm', 'synthetic canonical baseline');
  const stage = (name) => git('add', '--', `docs/${name}`);
  return { root, file, put, write, edit, git, stage, resources, recordDigest,
    run: (extra = {}) => inspectScopedGitDecisionScopes({ ...resources, ...extra }) };
}
const noPermit = (result) => {
  assert.equal(result.approval_verified, false); assert.equal(result.permission_evaluated, false);
  for (const key of ['ready', 'allowed', 'approved', 'allowed_paths']) assert.equal(Object.hasOwn(result, key), false);
};
const changeBinding = (f, update) => f.edit(HOME, ({ fm }) => update(fm.decision_work_scopes.bindings[0]));
const scope = (out) => out.after_decision_scopes.find((check) => check.decision === REF);
const allBlocked = (out, units = UNITS) => { assert.deepEqual(out.blocking_units, units); assert.ok(out.unit_checks.every((check) => !check.decisions_clear)); noPermit(out); };

test('D Decision scopes: current canonical blocks narrow only this prerequisite on real unchanged Git snapshots', (t) => {
  const f = fixture(t), index = fs.readFileSync(f.file('.git/index')), before = f.git('status', '--porcelain'), out = f.run();
  assert.deepEqual(out.blocking_units, ['other']); assert.deepEqual(out.unit_checks, [{ unit: 'known', decisions_clear: true }, { unit: 'other', decisions_clear: false }]);
  assert.equal(scope(out).declaration_scope_used, true); assert.equal(scope(out).binding_state, 'current-unverified');
  assert.equal(scope(out).scope_source, 'current-canonical-declaration'); assert.equal(scope(out).approval_verified, false);
  assert.equal(out.transition_valid, true); assert.equal(out.review_required, false); noPermit(out);
  assert.equal(out.git_snapshot.before.commit, f.git('rev-parse', 'HEAD')); assert.equal(out.git_snapshot.after.tree, f.git('rev-parse', 'HEAD^{tree}'));
  assert.deepEqual(fs.readFileSync(f.file('.git/index')), index); assert.equal(f.git('status', '--porcelain'), before);
  const conservative = inspectScopedGitDecisionTransitions(f.resources); assert.deepEqual(conservative.blocking_units, UNITS, 'existing conservative inspector API is unchanged');
});

test('D Decision scopes: explicit current empty blocks differs from missing scope without authenticating its author', (t) => {
  const current = fixture(t, { blocks: [] }).run(); assert.deepEqual(current.blocking_units, []);
  assert.ok(current.unit_checks.every((check) => check.decisions_clear)); assert.equal(scope(current).declaration_scope_used, true); noPermit(current);
  const missing = fixture(t, { absent: true }).run(); allBlocked(missing);
  assert.equal(scope(missing).scope_source, 'conservative-default'); assert.equal(scope(missing).binding_state, 'missing');
});

test('D Decision scopes: stale recorded digest remains blocking and is never rewritten', (t) => {
  const f = fixture(t, { stale: true }), before = fs.readFileSync(f.file(`docs/${HOME}`)), out = f.run(); allBlocked(out);
  assert.equal(scope(out).binding_state, 'stale-basis'); assert.equal(out.review_required, true);
  assert.deepEqual(fs.readFileSync(f.file(`docs/${HOME}`)), before);
});

test('D Decision scopes: selected contract changes in the index cannot borrow restored old worktree bytes', (t) => {
  const f = fixture(t), file = f.file('docs/rules.md'), original = fs.readFileSync(file);
  f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Changed selected contract.'); }); f.stage('rules.md'); fs.writeFileSync(file, original);
  const index = fs.readFileSync(f.file('.git/index')), out = f.run(); allBlocked(out); assert.equal(scope(out).binding_state, 'stale-basis');
  assert.notEqual(out.git_snapshot.before.tree, out.git_snapshot.after.tree); assert.deepEqual(fs.readFileSync(f.file('.git/index')), index);
  assert.deepEqual(fs.readFileSync(file), original); assert.equal(out.git_read_sets.after.find((e) => e.file === 'docs/rules.md').oid, f.git('rev-parse', ':docs/rules.md'));
});

test('D Decision scopes: an unstaged contract change and untracked approval claim cannot replace index facts', (t) => {
  const f = fixture(t); f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Unstaged change.'); });
  f.put('claims/approval.json', '{"approved":true}'); const before = f.git('status', '--porcelain'), out = f.run();
  assert.deepEqual(out.blocking_units, ['other']); assert.deepEqual(out.git_changes, []); noPermit(out);
  assert.equal(f.git('status', '--porcelain'), before); assert.match(fs.readFileSync(f.file('docs/rules.md'), 'utf8'), /Unstaged change/);
});

test('D Decision scopes: refreshed digest with reused approval_ref cannot lower an open scope', (t) => {
  const f = fixture(t); changeBinding(f, (b) => { b.blocks = []; }); f.recordDigest(); f.stage(HOME);
  const out = f.run(); allBlocked(out); assert.equal(scope(out).declaration_current, true);
  assert.equal(out.transition_valid, false); assert.ok(out.violations.some((v) => v.code === 'approval-ref-reused-with-changed-binding'));
});

test('D Decision scopes: a new recorded review reference is review material, not a verified human approval', (t) => {
  const f = fixture(t); changeBinding(f, (b) => { b.blocks = []; b.approval_ref = 'review:new-fixture-only-unverified'; }); f.recordDigest(); f.stage(HOME);
  const out = f.run(); assert.equal(out.transition_valid, true); assert.deepEqual(out.blocking_units, []);
  assert.equal(out.review_required, true); assert.equal(scope(out).approval_verified, false); noPermit(out);
  assert.ok(out.required_reviews.some((text) => text.includes('not authentication')));
});

test('D Decision scopes: newly added known units remain blocked until the full declaration is current', (t) => {
  const f = fixture(t); f.edit('screen.md', ({ fm }) => { fm.work_execution.units.push(unit('new-unit')); }); f.stage('screen.md');
  const out = f.run(); allBlocked(out, ['known', 'new-unit', 'other']); assert.equal(scope(out).binding_state, 'stale-known-units');
});

test('D Decision scopes: removing a unit from the owner does not silently repair known_units', (t) => {
  const f = fixture(t); f.edit('screen.md', ({ fm }) => { fm.work_execution.units.pop(); }); f.stage('screen.md');
  const out = f.run(); allBlocked(out, ['known']); assert.equal(scope(out).binding_state, 'stale-known-units');
});

test('D Decision scopes: reopened decisions with retained or replaced bindings invalidate every current unit', (t) => {
  const f = fixture(t, { status: 'resolved' }); f.edit(HOME, (doc) => { doc.body = decisions([row(), row('D-TWO')]); });
  changeBinding(f, (b) => { b.approval_ref = 'review:new-reopen-fixture'; }); f.recordDigest(); f.stage(HOME);
  const out = f.run(); allBlocked(out); assert.equal(out.transition_valid, false);
  assert.ok(out.violations.some((v) => v.code === 'reopen-binding-retained')); assert.ok(out.transitions.some((entry) => entry.reopened));
});

test('D Decision scopes: removing all reopened bindings is valid but remains conservatively blocked', (t) => {
  const f = fixture(t, { status: 'resolved' }); f.edit(HOME, (doc) => {
    doc.body = decisions([row(), row('D-TWO')]); doc.fm.decision_work_scopes.bindings = [];
  }); f.stage(HOME); const out = f.run(); allBlocked(out);
  assert.equal(out.transition_valid, true); assert.equal(scope(out).binding_state, 'missing');
});

test('D Decision scopes: removed open applicability cannot turn an empty after set into a scope exemption', (t) => {
  const f = fixture(t); f.edit('screen.md', ({ fm }) => { fm.decision_refs = []; }); f.stage('screen.md');
  const out = f.run(); allBlocked(out); assert.equal(out.removed_open_applicability, true); assert.equal(out.transition_valid, false);
  assert.deepEqual(out.after_decision_scopes, []);
});

test('D Decision scopes: actual canonical resolution removes the open block, not other execution requirements', (t) => {
  const f = fixture(t); f.edit(HOME, (doc) => { doc.body = decisions([row('D-ONE', 'resolved'), row('D-TWO')]); }); f.stage(HOME);
  const out = f.run(); assert.deepEqual(out.blocking_units, []); assert.equal(scope(out).scope_source, 'resolved-decision');
  assert.equal(scope(out).declaration_scope_used, false); assert.equal(out.review_required, true); noPermit(out);
});

test('D Decision scopes: unrelated content and set permutations change Git evidence without invalidating current scope', (t) => {
  const f = fixture(t); f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Changed unrelated prose.'); });
  f.edit('screen.md', ({ fm }) => { fm.work_execution.units.reverse(); }); changeBinding(f, (b) => { b.known_units.reverse(); });
  for (const name of ['rules.md', 'screen.md', HOME]) f.stage(name);
  const out = f.run(); assert.deepEqual(out.blocking_units, ['other']); assert.equal(out.scope_changed, false);
  assert.equal(out.review_required, false); assert.equal(out.git_changes.length, 3); noPermit(out);
});

test('D Decision scopes: all related decisions are inspected, not only the one with a current binding', (t) => {
  const f = fixture(t); f.edit('screen.md', ({ fm }) => { fm.decision_refs.push('D-TWO'); }); f.recordDigest();
  changeBinding(f, (b) => { b.approval_ref = 'review:expanded-synthetic-scope'; }); f.stage('screen.md'); f.stage(HOME);
  const out = f.run(); allBlocked(out); assert.equal(out.after_decision_scopes.length, 2);
  const unbound = out.after_decision_scopes.find((check) => check.decision.startsWith('decision:D-TWO@'));
  assert.equal(unbound.binding_state, 'missing'); assert.deepEqual(unbound.blocking_units, UNITS);
});

test('D Decision scopes: malformed binding, malformed Status and duplicate identities fail instead of narrowing', (t) => {
  const badBinding = fixture(t); changeBinding(badBinding, (b) => { b.blocks = null; }); badBinding.stage(HOME); assert.throws(() => badBinding.run());
  const badStatus = fixture(t); badStatus.edit(HOME, (doc) => { doc.body = decisions([row('D-ONE', 'maybe'), row('D-TWO')]); }); badStatus.stage(HOME); assert.throws(() => badStatus.run());
  const duplicate = fixture(t); duplicate.write('duplicate.md', { artifact_id: 'SCREEN-RESULT-001', artifact_type: 'screen-spec',
    screen_id: 'RESULT-001', domain: 'result', status: 'draft' }, '## Notes\nDuplicate.'); duplicate.stage('duplicate.md'); assert.throws(() => duplicate.run());
});

test('D Decision scopes: original symlink mode cannot borrow a regular worktree substitute', (t) => {
  const f = fixture(t), source = f.file('docs/rules.md'), bytes = fs.readFileSync(source);
  fs.unlinkSync(source); fs.symlinkSync('screen.md', source); f.stage('rules.md'); fs.unlinkSync(source); fs.writeFileSync(source, bytes);
  assert.throws(() => f.run(), /original regular Git blob required/);
});

test('D Decision scopes: caller snapshots, scope subsets, approval and evaluator callbacks are rejected', (t) => {
  const f = fixture(t);
  for (const extra of [{ approval_verified: true }, { verifyApproval: () => true }, { inspectPair: () => ({ blocking_units: [] }) },
    { before: {} }, { targetIndex: {} }, { known_units: ['known'] }, { unit: 'known' }]) {
    assert.throws(() => f.run(extra), /unsupported option/);
  }
  const first = f.run(); first.blocking_units.length = 0; first.after_decision_scopes[0].declared_binding.blocks.length = 0;
  assert.deepEqual(f.run().blocking_units, ['other']); noPermit(first);
});
