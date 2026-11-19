import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { KIT_ROOT, splitFrontmatter } from './util.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { inspectScopedDecisionBindings, inspectScopedSnapshotBindings } from './scoped-work-bindings.mjs';
import { inspectScopedDecisionScopes } from './scoped-work-decision-scopes.mjs';
import { inspectScopedUncertaintyScopes, resolveScopedUncertaintyBindingBasis } from './scoped-work-uncertainty-scopes.mjs';
import { resolveScopedBindingBasis } from './scoped-work-basis.mjs';

const OWNER = 'screen:EXAMPLE-A', UNITS = ['parse-result', 'settings-ui'];
const DECISION = 'decision:D-B@SCREEN-B', UNKNOWN = 'unknown:U-B@SCREEN-B', CONFLICT = 'conflict:C-B@SCREEN-B';
const ZERO = `sha256:${'0'.repeat(64)}`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const decisions = (id, status = 'open') => `## Open Decisions\n${table(
  ['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'],
  [[id, 'See artifact:RULES#screen-b', 'A / B', 'api-integrated-ui', 'PM', status]])}`;
const screen = (id) => ({ artifact_id: `SCREEN-${id}`, artifact_type: 'screen-spec', screen_id: `EXAMPLE-${id}`,
  domain: 'example', status: 'draft', api_required: false, screen_entry: `src/features/example/screens/EXAMPLE-${id}.tsx` });

// All documents and any recorded bindings are synthetic. The test's approval_ref
// is unverified evidence, never an authenticated human approval.
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-blocking-relations-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docsDir = path.join(root, 'docs'), kitRoot = path.join(root, '.kit'), docs = new Map();
  const file = (relative) => path.join(root, relative);
  const put = (relative, text) => { fs.mkdirSync(path.dirname(file(relative)), { recursive: true }); fs.writeFileSync(file(relative), text); };
  const write = (name, fm, body) => { put(`docs/${name}`, md(fm, body)); docs.set(name, file(`docs/${name}`)); };
  const edit = (name, update) => {
    const parsed = splitFrontmatter(fs.readFileSync(docs.get(name), 'utf8')), doc = { fm: parsed.data, body: parsed.body };
    update(doc); write(name, doc.fm, doc.body);
  };
  put('.kit/policy.yaml', '{}');
  put('.kit/adoption.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER], profiles: ['behavior'],
    role_limits: { behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] } }));
  put('.kit/layout.yaml', JSON.stringify({ roles: {
    screen: ['src/features/{domain}/screens/**'], domain_component: ['src/features/{domain}/components/**'],
    hook: ['src/features/{domain}/hooks/**'], api_client: ['src/api/**'], test: ['src/features/{domain}/tests/**'], route: ['src/routes/**'],
  } }));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  write('a.md', { ...screen('A'), work_execution: { version: 1, units: [
    { id: UNITS[0], kind: 'behavior', contracts: ['artifact:RULES#response'], sources: [] },
    { id: UNITS[1], kind: 'behavior', contracts: ['artifact:RULES#settings'], sources: [] },
  ] } }, '## Notes\nScreen A.');
  write('rules.md', { artifact_id: 'RULES', artifact_type: 'domain-rules', domain: 'example', status: 'confirmed' },
    '## Response\nParse the response.\n\n## Settings\nRender settings.\n\n## Screen B\nA separate screen policy.');
  write('b.md', screen('B'), `${decisions('D-B')}\n\n## Unknowns\n${table(['ID', 'Question', 'Status'],
    [['U-B', 'See artifact:RULES#screen-b', 'open']])}\n\n## Conflicts\n${table(['ID', 'Description', 'Status'],
    [['C-B', 'See artifact:RULES#screen-b', 'open']])}`);
  const options = () => ({ owner: OWNER, projectRoot: root, docsDir, kitRoot,
    policyFile: file('.kit/policy.yaml'), policyOverlayFile: file('.kit/adoption.yaml'),
    layoutFile: file('.kit/layout.yaml'), manifestFile: file('.kit/manifest.yaml'),
    targetIndex: buildReconciliationTargetIndex({ docs: [...docs.values()].map((target) =>
      ({ file: target, fm: splitFrontmatter(fs.readFileSync(target, 'utf8')).data })) }) });
  const link = (ref) => edit('rules.md', (doc) => { doc.body = doc.body.replace('Render settings.', `Render settings. See ${ref}`); });
  const bind = ({ blocks = [], knownUnits = UNITS } = {}) => edit('b.md', ({ fm }) => {
    fm.decision_work_scopes = { version: 1, bindings: [{ decision_id: 'D-B', owner: OWNER,
      known_units: [...knownUnits], blocks, basis_digest: ZERO, approval_ref: 'review:synthetic-unverified' }] };
  });
  const recordDigest = () => {
    const digest = resolveScopedBindingBasis({ ...options(), decisionRef: DECISION }).basis_digest;
    edit('b.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].basis_digest = digest; });
    return digest;
  };
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => {
    git('init', '-q'); git('config', 'user.name', 'Scoped Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'maintenance.auto', 'false'); git('config', 'gc.auto', '0'); git('add', '.'); git('commit', '-qm', 'synthetic scope fixture');
  };
  const status = (...args) => spawnSync(process.execPath, [path.join(KIT_ROOT, 'scripts/binding-status.mjs'), '--root', root,
    '--docs', 'docs', '--src', 'src', '--policy', '.kit/policy.yaml', '--manifest', '.kit/manifest.yaml',
    '--layout', '.kit/layout.yaml', '--owner', OWNER, ...args], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  return { root, file, edit, options, link, bind, recordDigest, git, commit, status };
}
const decision = (result) => result.checks.find((entry) => entry.decision === DECISION);

test('#333 separate sections of one document do not import another screen Decision, Unknown or Conflict', (t) => {
  const f = fixture(t), result = inspectScopedSnapshotBindings(f.options());
  assert.deepEqual(result.decisions.checks, []);
  assert.deepEqual(result.uncertainty.checks, []);
  assert.deepEqual(inspectScopedDecisionScopes(f.options()).blocking_units, []);
});

test('#333 a foreign Decision reached by one unit does not block the independent unit', (t) => {
  const f = fixture(t); f.link(DECISION);
  const inspection = inspectScopedDecisionBindings(f.options()), check = decision(inspection);
  assert.ok(check.applications.length > 0);
  assert.ok(check.applications.every((application) => application.unit === 'settings-ui'));
  assert.deepEqual(check.blocking_units, ['settings-ui']);
  const scopes = inspectScopedDecisionScopes(f.options());
  assert.deepEqual(scopes.blocking_units, ['settings-ui']);
  assert.deepEqual(scopes.unit_checks, [{ unit: 'parse-result', decisions_clear: true }, { unit: 'settings-ui', decisions_clear: false }]);
  assert.equal(scopes.approval_verified, false);
});

test('#333 a Decision independently reached by both units keeps both applications blocking', (t) => {
  const f = fixture(t); f.link(DECISION);
  f.edit('rules.md', (doc) => { doc.body = doc.body.replace('Parse the response.', `Parse the response. See ${DECISION}`); });
  const scopes = inspectScopedDecisionScopes(f.options()), check = decision(scopes);
  assert.deepEqual([...new Set(check.applications.map((entry) => entry.unit))].sort(), UNITS);
  assert.ok(check.applications.every((entry) => entry.unit !== null));
  assert.deepEqual(check.blocking_units, UNITS);
  assert.ok(scopes.unit_checks.every((entry) => !entry.decisions_clear));
});

test('#333 an explicit indirect Unknown to Conflict to Decision path still blocks the unit that reaches it', (t) => {
  const f = fixture(t); f.link(UNKNOWN);
  f.edit('b.md', (doc) => {
    doc.body = doc.body.replace('| U-B | See artifact:RULES#screen-b |', `| U-B | See ${CONFLICT} |`)
      .replace('| C-B | See artifact:RULES#screen-b |', `| C-B | See ${DECISION} |`);
  });
  const uncertainty = inspectScopedUncertaintyScopes(f.options());
  assert.deepEqual(uncertainty.checks.map((check) => [check.uncertainty, check.blocking_units]).sort(),
    [[CONFLICT, ['settings-ui']], [UNKNOWN, ['settings-ui']]].sort());
  const scopes = inspectScopedDecisionScopes(f.options());
  assert.deepEqual(scopes.blocking_units, ['settings-ui']);
  assert.ok(decision(scopes).applications.every((application) => application.unit === 'settings-ui'));
});

test('#333 owner-native rows retain the conservative default for every unit', (t) => {
  const f = fixture(t);
  f.edit('a.md', (doc) => { doc.body += `\n\n${decisions('D-A')}\n\n## Unknowns\n${table(['ID', 'Question'], [['U-A', 'Native question?']])}`; });
  const result = inspectScopedSnapshotBindings(f.options());
  const check = result.decisions.checks.find((entry) => entry.decision === 'decision:D-A@SCREEN-A');
  assert.ok(check.applications.some((entry) => entry.unit === null && entry.relation === 'local'));
  assert.deepEqual(check.blocking_units, UNITS);
  assert.deepEqual(inspectScopedDecisionScopes(f.options()).blocking_units, UNITS);
  assert.deepEqual(result.uncertainty.checks.find((entry) => entry.uncertainty === 'unknown:U-A@SCREEN-A').blocking_units, UNITS);
});

for (const kind of ['missing', 'stale-basis', 'stale-known-units']) {
  test(`#333 ${kind} foreign Decision binding keeps reached units blocked without widening them`, (t) => {
    const f = fixture(t); f.link(DECISION);
    if (kind !== 'missing') f.bind({ knownUnits: kind === 'stale-known-units' ? ['settings-ui'] : UNITS });
    const before = fs.readFileSync(f.file('docs/b.md')), scopes = inspectScopedDecisionScopes(f.options());
    assert.equal(decision(scopes).binding_state, kind);
    assert.deepEqual(decision(scopes).blocking_units, ['settings-ui'], kind);
    assert.equal(decision(scopes).scope_review_needed, true);
    assert.deepEqual(fs.readFileSync(f.file('docs/b.md')), before);
  });
}

test('#333 resolved status and a current human-owned scope keep their existing Decision semantics', (t) => {
  const resolved = fixture(t); resolved.link(DECISION);
  resolved.edit('b.md', (doc) => { doc.body = doc.body.replace('| PM | open |', '| PM | resolved |'); });
  assert.deepEqual(decision(inspectScopedDecisionScopes(resolved.options())).blocking_units, []);
  const current = fixture(t); current.link(DECISION); current.bind(); current.recordDigest();
  const before = fs.readFileSync(current.file('docs/b.md')), check = decision(inspectScopedDecisionScopes(current.options()));
  assert.equal(check.binding_state, 'current-unverified');
  assert.deepEqual(check.blocking_units, []);
  assert.equal(check.approval_verified, false);
  assert.deepEqual(fs.readFileSync(current.file('docs/b.md')), before);
});

test('#333 malformed dependencies and malformed scope declarations remain fail-closed', (t) => {
  const missing = fixture(t); missing.link('decision:D-MISSING@SCREEN-B');
  assert.throws(() => inspectScopedSnapshotBindings(missing.options()), /missing|unknown|unresolved|ambiguous/i);
  const malformed = fixture(t); malformed.link(DECISION); malformed.bind();
  malformed.edit('b.md', ({ fm }) => { fm.decision_work_scopes.bindings[0].blocks = ['not-a-unit']; });
  assert.throws(() => inspectScopedDecisionScopes(malformed.options()), /blocks|known_units/);
});

test('#333 public binding-status reports the same unit scope from committed HEAD without altering the repository', (t) => {
  const f = fixture(t); f.link(DECISION); f.commit();
  const before = { head: f.git('rev-parse', 'HEAD'), status: f.git('status', '--porcelain'), index: fs.readFileSync(f.file('.git/index')) };
  const run = f.status('--json'); assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout), check = report.owners[0].rows.find((entry) => entry.ref === DECISION);
  assert.equal(report.snapshot.commit, before.head);
  assert.deepEqual(check.blocking_units, ['settings-ui']);
  assert.equal(check.state, 'missing');
  assert.ok(check.applications.length > 0);
  assert.ok(check.applications.every((application) => application.owner === OWNER && application.unit === 'settings-ui'));
  assert.deepEqual(check.blocking_applications, check.applications);
  const uncertainty = report.owners[0].rows.find((entry) => entry.ref === UNKNOWN);
  assert.equal(uncertainty.blocking_applications[0].relation, 'inverse-evidence');
  assert.ok(uncertainty.blocking_applications[0].witnesses.some((witness) =>
    witness.dependency === 'artifact:RULES#screen-b' && witness.selected === 'artifact:RULES#screen-b'));
  const progress = f.status('--json', '--progress'); assert.equal(progress.status, 0, progress.stderr || progress.stdout);
  assert.equal(progress.stdout, run.stdout, 'progress diagnostics cannot change the report');
  assert.match(progress.stderr, /owner/);
  const text = f.status(); assert.equal(text.status, 0, text.stderr || text.stdout);
  for (const ref of [DECISION, UNKNOWN, 'artifact:RULES#screen-b']) assert.ok(text.stdout.includes(ref));
  assert.match(text.stdout, /settings-ui/);
  assert.match(text.stdout, /selected-evidence/);
  assert.match(text.stdout, /inverse-evidence/);
  assert.equal(report.approval_verified, false);
  assert.equal(f.git('rev-parse', 'HEAD'), before.head);
  assert.equal(f.git('status', '--porcelain'), before.status);
  assert.deepEqual(fs.readFileSync(f.file('.git/index')), before.index);
});

test('#333 status exposes each indirect row relation and native owner-wide applications', (t) => {
  const f = fixture(t); f.link(UNKNOWN);
  f.edit('b.md', (doc) => {
    doc.body = doc.body.replace('| U-B | See artifact:RULES#screen-b |', `| U-B | See ${CONFLICT} |`)
      .replace('| C-B | See artifact:RULES#screen-b |', `| C-B | See ${DECISION} |`);
  });
  f.edit('a.md', (doc) => { doc.body += `\n\n${decisions('D-A')}`; });
  f.commit();
  const run = f.status('--json'); assert.equal(run.status, 0, run.stderr || run.stdout);
  const rows = JSON.parse(run.stdout).owners[0].rows;
  for (const ref of [DECISION, UNKNOWN, CONFLICT]) {
    const row = rows.find((entry) => entry.ref === ref);
    assert.ok(row.applications.length > 0, ref);
    assert.ok(row.blocking_applications.length > 0, ref);
    assert.ok(row.blocking_applications.every((entry) => row.blocking_units.includes(entry.unit)), ref);
  }
  const native = rows.find((entry) => entry.ref === 'decision:D-A@SCREEN-A');
  assert.deepEqual(native.blocking_units, UNITS);
  assert.ok(native.blocking_applications.some((entry) => entry.unit === null && entry.relation === 'local'));
  const text = f.status(); assert.equal(text.status, 0, text.stderr || text.stdout);
  assert.match(text.stdout, /all owner units/);
  assert.match(text.stdout, /local/);
});

for (const state of ['current', 'stale', 'unresolved', 'resolved']) {
  test(`#333 ${state} report distinguishes possible relations from evaluated missing-binding blockers`, (t) => {
    const f = fixture(t);
    if (state !== 'unresolved') f.link(DECISION);
    if (state !== 'resolved') f.bind();
    if (state === 'current') f.recordDigest();
    if (state === 'resolved') f.edit('b.md', (doc) => { doc.body = doc.body.replace('| PM | open |', '| PM | resolved |'); });
    f.commit();
    const run = f.status('--json'); assert.equal(run.status, 0, run.stderr || run.stdout);
    const check = JSON.parse(run.stdout).owners[0].rows.find((entry) => entry.ref === DECISION);
    assert.equal(check.state, state === 'resolved' ? 'missing' : state);
    assert.deepEqual(check.blocking_applications, state === 'resolved' ? [] : null);
    if (state === 'unresolved') assert.deepEqual(check.applications, []);
    else assert.ok(check.applications.length > 0);
  });
}

test('#333 a bound-out native Unknown leaves foreign potential relations visible without reporting them as blockers', (t) => {
  const f = fixture(t), native = 'unknown:U-A@SCREEN-A';
  f.edit('a.md', (doc) => {
    doc.body += `\n\n## Unknowns\n${table(['ID', 'Question', 'Status'], [['U-A', `See ${UNKNOWN}`, 'open']])}`;
    doc.fm.uncertainty_work_scopes = { version: 1, bindings: [{ unknown_id: 'U-A', owner: OWNER,
      known_units: [...UNITS], blocks: [], basis_digest: ZERO, approval_ref: 'review:synthetic-native-uncertainty' }] };
  });
  const before = inspectScopedUncertaintyScopes(f.options()).checks.find((entry) => entry.uncertainty === UNKNOWN);
  assert.deepEqual(before.blocking_units, UNITS, 'the stale native binding must initially retain the indirect blockers');
  assert.ok(before.applications.every((entry) => entry.relation === 'transitive-evidence'));
  const digest = resolveScopedUncertaintyBindingBasis({ ...f.options(), uncertaintyRef: native }).basis_digest;
  f.edit('a.md', ({ fm }) => { fm.uncertainty_work_scopes.bindings[0].basis_digest = digest; });
  f.commit();
  const run = f.status('--json'); assert.equal(run.status, 0, run.stderr || run.stdout);
  const rows = JSON.parse(run.stdout).owners[0].rows, check = rows.find((entry) => entry.ref === UNKNOWN);
  assert.equal(rows.find((entry) => entry.ref === native).state, 'current');
  assert.deepEqual(rows.find((entry) => entry.ref === native).recorded.blocks, []);
  assert.equal(check.state, 'missing');
  assert.deepEqual([...new Set(check.applications.map((entry) => entry.unit))].sort(), UNITS);
  assert.ok(check.applications.every((entry) => entry.relation === 'transitive-evidence' &&
    entry.witnesses.some((witness) => witness.via === native)));
  assert.deepEqual(check.blocking_units, []);
  assert.deepEqual(check.blocking_applications, []);
});

test('#333 a current Decision declaration preserves blocks outside its evidence-unit applications', (t) => {
  const f = fixture(t); f.link(DECISION); f.bind({ blocks: ['parse-result'] }); f.recordDigest();
  const scopes = inspectScopedDecisionScopes(f.options()), check = decision(scopes);
  assert.equal(check.binding_state, 'current-unverified');
  assert.ok(check.applications.length > 0);
  assert.ok(check.applications.every((entry) => entry.unit === 'settings-ui'));
  assert.deepEqual(check.declared_binding.blocks, ['parse-result']);
  assert.deepEqual(check.blocking_units, ['parse-result']);
  assert.deepEqual(scopes.unit_checks, [{ unit: 'parse-result', decisions_clear: false }, { unit: 'settings-ui', decisions_clear: true }]);
  assert.equal(check.approval_verified, false);
});
