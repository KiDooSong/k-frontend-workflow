import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';
import { execFileSync } from 'node:child_process';
import { inspectScopedGitDecisionTransitions } from './scoped-work-git-transitions.mjs';

const OWNER = 'screen:RESULT-001';
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
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-transitions-')));
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


// All Git operations below belong to isolated test fixtures, never a consumer
// checkout. The connector workflow executes these in CI, not the editing session.
function repository(t, { nested = false, resolved = false } = {}) {
  const f = fixture(t);
  if (resolved) f.change(HOME, (doc) => { doc.body = body([row('D-ONE', 'resolved'), row('D-TWO')]); });
  f.recordDigest();
  let repositoryRoot = f.root, projectRoot = f.root;
  if (nested) {
    repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-git-parent-'));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    projectRoot = path.join(repositoryRoot, 'packages', 'web app');
    fs.mkdirSync(path.dirname(projectRoot), { recursive: true });
    fs.cpSync(f.root, projectRoot, { recursive: true });
  }
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: repositoryRoot,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
  git('init', '-q'); git('config', 'user.email', 'scoped-test@example.invalid'); git('config', 'user.name', 'Scoped Test');
  git('config', 'core.autocrlf', 'false'); git('config', 'core.filemode', 'true');
  git('add', '--', '.'); git('commit', '-qm', 'canonical baseline');
  const file = (relative) => path.join(projectRoot, relative);
  const edit = (relative, update) => {
    const target = file(relative), value = splitFrontmatter(fs.readFileSync(target, 'utf8'));
    const doc = { fm: value.data, body: value.body }; update(doc); fs.writeFileSync(target, md(doc.fm, doc.body));
  };
  const options = { owner: OWNER, root: projectRoot, docs: 'docs', kit: '.kit',
    policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' };
  const stage = (relative) => git('add', '--', path.relative(repositoryRoot, file(relative)));
  const indexFile = path.join(repositoryRoot, '.git/index');
  return { ...f, repositoryRoot, projectRoot, git, file, edit, stage, options, indexFile,
    run: (extra = {}) => inspectScopedGitDecisionTransitions({ ...options, ...extra }) };
}
const noPermit = (result) => {
  assert.equal(result.approval_verified, false);
  for (const key of ['ready', 'allowed', 'approved', 'allowed_paths', 'effective_binding']) assert.equal(Object.hasOwn(result, key), false);
};
const reopen = (r) => r.edit(`docs/${HOME}`, (doc) => { doc.body = body([row(), row('D-TWO')]); });
const codes = (result) => result.violations.map((entry) => entry.code);

test('D Git transitions: HEAD and index are real OIDs and index/worktree bytes are preserved', (t) => {
  const r = repository(t), bytes = fs.readFileSync(r.indexFile), result = r.run();
  assert.equal(result.git_snapshot.before.commit, r.git('rev-parse', 'HEAD'));
  assert.equal(result.git_snapshot.before.tree, r.git('rev-parse', 'HEAD^{tree}'));
  assert.equal(result.git_snapshot.after.kind, 'index'); assert.equal(result.git_snapshot.after.tree, result.git_snapshot.before.tree);
  assert.equal(result.scope_changed, false); assert.deepEqual(result.git_changes, []); noPermit(result);
  assert.deepEqual(fs.readFileSync(r.indexFile), bytes);
  const evidence = result.git_read_sets.after.find((entry) => entry.file === 'docs/rules.md');
  assert.equal(evidence.oid, r.git('rev-parse', 'HEAD:docs/rules.md')); assert.equal(evidence.git_mode, '100644');
  assert.match(evidence.sha256, /^sha256:[0-9a-f]{64}$/);
});

test('D Git transitions: staged contract changes are read even when worktree restores old bytes', (t) => {
  const r = repository(t), target = r.file('docs/rules.md'), original = fs.readFileSync(target);
  r.edit('docs/rules.md', (doc) => { doc.body = doc.body.replace('Known contract.', 'Staged new contract.'); }); r.stage('docs/rules.md');
  fs.writeFileSync(target, original); const index = fs.readFileSync(r.indexFile), result = r.run();
  assert.equal(result.scope_changed, true); assert.equal(result.review_required, true);
  assert.equal(result.transitions[0].after_binding_state, 'stale-basis'); assert.deepEqual(result.blocking_units, UNITS);
  assert.equal(result.git_changes[0].path, 'docs/rules.md'); assert.equal(result.git_changes[0].status, 'M');
  assert.notEqual(result.git_changes[0].before.oid, result.git_changes[0].after.oid); noPermit(result);
  assert.deepEqual(fs.readFileSync(target), original); assert.deepEqual(fs.readFileSync(r.indexFile), index);
});

test('D Git transitions: unstaged and untracked facts are not silently staged or used', (t) => {
  const r = repository(t); r.edit('docs/rules.md', (doc) => { doc.body = '## Rules\nUnstaged replacement.'; });
  fs.writeFileSync(r.file('docs/untracked.md'), 'Untracked user work.');
  const bytes = fs.readFileSync(r.indexFile), dirty = fs.readFileSync(r.file('docs/rules.md')), result = r.run();
  assert.equal(result.scope_changed, false); assert.deepEqual(result.git_changes, []);
  assert.deepEqual(fs.readFileSync(r.indexFile), bytes); assert.deepEqual(fs.readFileSync(r.file('docs/rules.md')), dirty);
  assert.equal(fs.readFileSync(r.file('docs/untracked.md'), 'utf8'), 'Untracked user work.'); noPermit(result);
});

test('D Git transitions: committed resolved decision with staged reopen retains no old binding', (t) => {
  const r = repository(t, { resolved: true }); reopen(r); r.stage(`docs/${HOME}`);
  const result = r.run(); assert.ok(codes(result).includes('reopen-binding-retained'));
  assert.equal(result.transitions[0].reopened, true); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D Git transitions: staged removal of all reopened bindings does not manufacture approval', (t) => {
  const r = repository(t, { resolved: true }); reopen(r);
  r.edit(`docs/${HOME}`, ({ fm }) => { fm.decision_work_scopes.bindings = []; }); r.stage(`docs/${HOME}`);
  const result = r.run(); assert.deepEqual(result.violations, []); assert.equal(result.transitions[0].reopened, true);
  assert.equal(result.review_required, true); assert.deepEqual(result.blocking_units, UNITS); noPermit(result);
});

test('D Git transitions: staged removal of applicability cannot hide a simultaneous reopen', (t) => {
  const r = repository(t, { resolved: true }); reopen(r); r.stage(`docs/${HOME}`);
  r.edit('docs/screen.md', ({ fm }) => { fm.decision_refs = []; }); r.stage('docs/screen.md');
  const result = r.run(); assert.equal(result.transitions[0].after_applicable, false);
  assert.ok(codes(result).includes('reopen-binding-retained')); assert.deepEqual(result.blocking_units, UNITS);
});

test('D Git transitions: a staged new approval string is review material, never authority', (t) => {
  const r = repository(t); r.edit(`docs/${HOME}`, ({ fm }) => { fm.decision_work_scopes.bindings[0].approval_ref = 'review:changed'; });
  r.stage(`docs/${HOME}`); const result = r.run(); assert.equal(result.review_required, true); noPermit(result);
  assert.deepEqual(result.blocking_units, UNITS);
});

test('D Git transitions: unrelated staged content preserves scope but remains in Git evidence', (t) => {
  const r = repository(t); r.edit('docs/rules.md', (doc) => { doc.body = doc.body.replace('Unselected prose.', 'Unrelated change.'); });
  r.stage('docs/rules.md'); const result = r.run(); assert.equal(result.scope_changed, false);
  assert.equal(result.review_required, false); assert.equal(result.git_changes.length, 1);
  assert.notDeepEqual(result.git_read_sets.before, result.git_read_sets.after); noPermit(result);
});

test('D Git transitions: nested roots retain original repository paths and outside-root changes', (t) => {
  const r = repository(t, { nested: true }); fs.writeFileSync(path.join(r.repositoryRoot, 'outside.txt'), 'Outside project.');
  r.git('add', '--', 'outside.txt'); const result = r.run();
  assert.equal(result.git_snapshot.project_prefix, 'packages/web app');
  assert.ok(result.git_read_sets.after.every((entry) => entry.repository_path.startsWith('packages/web app/')));
  assert.equal(result.git_changes[0].path, 'outside.txt'); assert.equal(result.git_changes[0].before, null);
  assert.equal(result.git_changes[0].after.mode, '100644'); noPermit(result);
});

test('D Git transitions: absolute in-project resources map to the same captured relative paths', (t) => {
  const r = repository(t), result = r.run({ docs: r.file('docs'), policy: r.file('.kit/policy.yaml') });
  assert.equal(result.git_snapshot.resources.docs, 'docs'); assert.equal(result.git_snapshot.resources.policy, '.kit/policy.yaml');
  assert.throws(() => r.run({ policy: path.join(r.repositoryRoot, '..', 'outside-policy.yaml') }), /inside --root/);
});

test('D Git transitions: caller snapshots, indexes and approval callbacks are rejected', (t) => {
  const r = repository(t);
  for (const key of ['before', 'after', 'targetIndex', 'base', 'approved', 'approvalVerifier']) {
    assert.throws(() => r.run({ [key]: key === 'approvalVerifier' ? () => true : {} }), /unsupported option/);
  }
  for (const key of ['root', 'docs', 'kit', 'policy', 'manifest', 'layout']) assert.throws(() => r.run({ [key]: undefined }), /explicit/);
});

test('D Git transitions: original symlink policy is rejected even if worktree has a regular substitute', (t) => {
  const r = repository(t), file = r.file('.kit/policy.yaml'), bytes = fs.readFileSync(file);
  fs.renameSync(file, r.file('.kit/real-policy.yaml')); fs.symlinkSync('real-policy.yaml', file); r.stage('.kit');
  fs.unlinkSync(file); fs.writeFileSync(file, bytes); const index = fs.readFileSync(r.indexFile);
  assert.throws(() => r.run(), /original regular Git blob/); assert.deepEqual(fs.readFileSync(r.indexFile), index);
});

test('D Git transitions: original gitlink resources cannot be borrowed from the working directory', (t) => {
  const r = repository(t); r.git('update-index', '--add', '--cacheinfo', '160000', r.git('rev-parse', 'HEAD'), '.kit/policy.yaml');
  assert.throws(() => r.run(), /original regular Git blob/);
});

test('D Git transitions: a symlinked canonical Markdown cannot add a hidden index member', (t) => {
  const r = repository(t); fs.symlinkSync('rules.md', r.file('docs/alias.md')); r.stage('docs/alias.md');
  assert.throws(() => r.run(), /original regular Git blob/);
});

test('D Git transitions: staged duplicate owner identity is rejected without rewriting index', (t) => {
  const r = repository(t); fs.copyFileSync(r.file('docs/screen.md'), r.file('docs/duplicate.md')); r.stage('docs/duplicate.md');
  const bytes = fs.readFileSync(r.indexFile); assert.throws(() => r.run(), /duplicate|ambiguous|unique/i);
  assert.deepEqual(fs.readFileSync(r.indexFile), bytes);
});

test('D Git transitions: mode-only and rename changes remain visible, not relabeled as safe work', (t) => {
  const r = repository(t); r.git('update-index', '--chmod=+x', 'docs/rules.md');
  const result = r.run(), change = result.git_changes.find((entry) => entry.path === 'docs/rules.md');
  assert.equal(change.before.mode, '100644'); assert.equal(change.after.mode, '100755'); noPermit(result);
  // Rename only unrelated source content; never rename a canonical authority home.
  fs.writeFileSync(r.file('notes.txt'), 'A stable user note.\n'); r.stage('notes.txt'); r.git('commit', '-qm', 'note baseline');
  r.git('mv', 'notes.txt', 'renamed.txt');
  const renamed = r.run().git_changes.find((entry) => entry.status === 'R');
  assert.equal(renamed.oldPath, 'notes.txt'); assert.equal(renamed.newPath, 'renamed.txt'); assert.equal(renamed.before.oid, renamed.after.oid);
});

for (const change of ['HEAD', 'index']) test(`D Git transitions: a ${change} change during inspection invalidates the observation`, (t) => {
  const r = repository(t), open = fs.openSync; let injected = false;
  t.mock.method(fs, 'openSync', function (target, ...args) {
    if (!injected && typeof target === 'string' && target.includes('workflow-visual-refresh-tree-') && target.endsWith('/.kit/policy.yaml')) {
      injected = true;
      if (change === 'HEAD') r.git('commit', '--allow-empty', '-qm', 'concurrent commit');
      else { fs.writeFileSync(r.file('concurrent.txt'), 'Concurrent index update.'); r.stage('concurrent.txt'); }
    }
    return open.call(this, target, ...args);
  });
  assert.throws(() => r.run(), /HEAD or staged index changed/); assert.equal(injected, true);
});
