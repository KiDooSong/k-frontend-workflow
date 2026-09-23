import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { splitFrontmatter, DEFAULTS } from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { prepareScopedWork, cleanupScopedWork, publicScopedEnvelope, isScopedWorkDocument, evaluateScopedGit } from './scoped-work-execution.mjs';

const SURFACE = 'surface:RESULT-PANEL', MEMBERS = ['RESULT-001', 'RESULT-002'];
const DOCS = 'docs/frontend-workflow', PREFIX = 'src/features/result', SHARED = `${PREFIX}/components/panel`;
const PANEL = `${SHARED}/Panel.tsx`, ENTRY = (id) => `${PREFIX}/screens/${id}.tsx`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const SURFACE_BODY = ['# Shared result panel', '## Purpose\nUniform result panel.',
  `## Host Contract\n${table(['Direction', 'Name', 'Meaning', 'Required'], [['output', 'onRetry', 'Retry intent', 'yes']])}`,
  `## State Matrix\n${table(['State', 'Condition', 'UI'], ['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map((state) => [state, state, state]))}`,
  `## Interaction Matrix\n${table(['User Action', 'Trigger', 'Result', 'Result Type', 'Target', 'Params', 'Analytics Event'], [['Retry', 'press', 'retry', 'state', 'result', '-', '-']])}`,
  '## Mutation Matrix\n없음', '## Data Requirements\n- none', '## API Candidates\n없음',
  `## Copy Keys\n${table(['Key', '문구', 'Status'], [['panel.retry', 'Retry', 'draft']])}`,
  '## Accessibility\n- labelled retry', '## Acceptance Criteria\n- [ ] same retry intent',
  `## Unknowns\n${table(['ID', 'Question', 'Status'], [])}`].join('\n\n');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

function repository(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-exec-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-exec-request-')));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  const docs = new Map();
  function put(name, value) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  }
  function write(name, relative, fm, body) { const file = put(`${DOCS}/${relative}`, md(fm, body)); docs.set(name, file); return file; }
  function edit(name, update) {
    const file = docs.get(name), before = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    const next = { fm: before.data, body: before.body }; update(next); fs.writeFileSync(file, md(next.fm, next.body));
  }
  const work = { version: 1, owners: [SURFACE, ...MEMBERS.map((id) => `screen:${id}`)], profiles: ['visual', 'api-contract', 'behavior'],
    role_limits: { visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'] }, deny_paths: [] };
  put('.kit/policy.yaml', `${fs.readFileSync(DEFAULTS.policy, 'utf8')}\nwork_execution: ${JSON.stringify(work)}\n`);
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const number of [0, 1, 2]) write(`rules-${number}.md`, `domains/result/rules/rules-${number}.md`, { artifact_id: `RULES-${number}`,
    artifact_type: 'domain-rules', domain: 'result', status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-09-23',
    decision_id: `fixture-rules-${number}` }, `## Rules\nKnown local behavior ${number}, without network calls.`);
  MEMBERS.forEach((id, index) => write(`screen-${index + 1}.md`, `domains/result/screens/${id.toLowerCase()}/screen-spec.md`, {
    artifact_id: `HOST-${index + 1}`, artifact_type: 'screen-spec', screen_id: id, domain: 'result', route: `/${id.toLowerCase()}`,
    status: 'draft', api_required: false, screen_entry: ENTRY(id),
    work_execution: { version: 1, units: [{ id: 'known', kind: 'behavior', contracts: [`artifact:RULES-${index + 1}#rules`], sources: [] }] },
  }, '## Notes\nExisting host.'));
  write('surface.md', 'domains/result/surfaces/result-panel/surface-spec.md', { artifact_id: 'SURFACE', artifact_type: 'shared-surface-spec',
    surface_id: 'RESULT-PANEL', domain: 'result', status: 'draft', api_required: false, member_screens: [...MEMBERS],
    implementation_paths: [`${SHARED}/**`],
    work_execution: { version: 1, units: [{ id: 'panel', kind: 'behavior', contracts: ['artifact:RULES-0#rules'], sources: [],
      host_units: Object.fromEntries(MEMBERS.map((id) => [id, 'known'])) }] },
  }, SURFACE_BODY);
  for (const file of [PANEL, ...MEMBERS.map(ENTRY)]) put(file, 'export default null;\n');
  function writeState(update = (state) => state) {
    const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
    const state = buildState({ docsDir: path.join(root, DOCS), srcDir: path.join(root, 'src'), date: '2026-09-23', layout, projectRoot: root }).state;
    put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(update(state)));
  }
  function commit(message = 'baseline', updateState) {
    writeState(updateState);
    git(root, 'add', '-A'); git(root, 'commit', '-qm', message);
  }
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'config', 'user.name', 'test');
  commit();
  function request(requests = [surfaceRequest()], origins = [], where = outside) {
    const file = path.join(where, 'request.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, origin_inputs: origins, requests })); return file;
  }
  const flags = (work) => ({ work, root, docs: DOCS, src: 'src', policy: '.kit/policy.yaml', manifest: '.kit/manifest.yaml', layout: '.kit/layout.yaml' });
  function prepare(t2, work = request()) {
    const preflight = prepareScopedWork(flags(work));
    t2.after(() => cleanupScopedWork(preflight));
    return preflight;
  }
  return { root, outside, docs, put, edit, commit, request, flags, prepare };
}
const surfaceRequest = (targets = [PANEL]) => ({ owner: SURFACE, authority: 'scoped', unit: 'panel',
  targets: targets.map((file) => ({ path: file, change: 'M' })) });

test('D preflight: a scoped surface request is evaluated only on the immutable HEAD baseline', (t) => {
  const r = repository(t), preflight = r.prepare(t), env = publicScopedEnvelope(preflight);
  assert.equal(env.ready, true, JSON.stringify(env.denials)); assert.equal(env.work_contract, 1); assert.equal(env.authority, 'scoped');
  assert.equal(env.snapshot.commit, git(r.root, 'rev-parse', 'HEAD').trim());
  assert.equal(env.snapshot.tree, git(r.root, 'rev-parse', 'HEAD^{tree}').trim());
  assert.match(env.request_digest, /^sha256:[0-9a-f]{64}$/); assert.equal(env.snapshot.work_request.path, null);
  const [selected] = env.requests;
  assert.deepEqual([selected.owner, selected.unit, selected.kind, selected.ready], [SURFACE, 'panel', 'behavior', true]);
  assert.deepEqual(selected.path_authorizations, [{ path: PANEL, change: 'M', reasons: [], allowed: true }]);
  assert.deepEqual(selected.evidence.hosts.map((host) => [host.owner, host.host_satisfied]),
    MEMBERS.map((id) => [`screen:${id}`, true]));
  assert.deepEqual(selected.evidence.contracts, ['artifact:RULES-0#rules']);
  // Every file the scoped hosts read is pinned for the backstop, not only C's resources.
  const pinned = new Set(env.snapshot.authority_read_set.map((entry) => entry.path));
  for (const file of ['.kit/policy.yaml', '.kit/layout.yaml', '.kit/manifest.yaml', `${DOCS}/_meta/workflow-state.yaml`,
    `${DOCS}/domains/result/rules/rules-1.md`, `${DOCS}/domains/result/rules/rules-2.md`,
    `${DOCS}/domains/result/surfaces/result-panel/surface-spec.md`]) assert.ok(pinned.has(file), file);
  assert.ok(env.snapshot.authority_read_set.some((entry) => entry.source === 'artifact-index'));
  // Legacy readiness is preserved; its phase blockers are informational only.
  assert.ok(env.legacy_readiness[SURFACE]); assert.equal(Object.hasOwn(env, '_context'), false);
  assert.equal(env.approval_verified, false);
});

test('D preflight: uncommitted worktree edits cannot change baseline authority in either direction', (t) => {
  const r = repository(t);
  r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; });
  assert.equal(r.prepare(t).ready, true, 'the committed confirmed contract is the baseline');
  r.commit('draft host contract');
  const blocked = r.prepare(t);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.denials.some((entry) => entry.code === 'confirmed-behavior-contract-required' && entry.host === 'screen:RESULT-002'));
  r.edit('rules-2.md', ({ fm }) => { fm.status = 'confirmed'; });
  assert.equal(r.prepare(t).ready, false, 'a worktree repair is not baseline authority');
});

test('D preflight: stale legacy state and legacy structural errors are errors, not future requirements', (t) => {
  const r = repository(t);
  r.commit('drop a screen from the generated state', (state) => { delete state.screens['RESULT-001']; return state; });
  const stale = r.prepare(t, r.request([{ owner: 'screen:RESULT-001', authority: 'scoped', unit: 'known',
    targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] }]));
  assert.equal(stale.ready, false); assert.deepEqual(stale.errors.map((entry) => entry.code), ['SW-LEGACY-STATE-001']);
  const s = repository(t); s.edit('surface.md', (doc) => { doc.body = doc.body.replace('| retry | state |', '| retry | route |'); }); s.commit('route edge');
  const invalid = s.prepare(t);
  assert.equal(invalid.ready, false); assert.ok(invalid.errors.some((entry) => entry.code === 'SW-AUTHORITY-INVALID' && entry.owner === SURFACE));
});

test('D preflight: mixed documents, non A/M changes, unresolved origins and symlinked requests are input errors', (t) => {
  const r = repository(t);
  const current = { owner: 'screen:RESULT-001', authority: 'current', requested_mode: 'rough-fixture-ui', targets: [{ path: ENTRY('RESULT-001'), change: 'M' }] };
  assert.throws(() => r.prepare(t, r.request([current, surfaceRequest()])), /mixed current\/scoped/);
  assert.equal(isScopedWorkDocument({ requests: [current] }), false);
  assert.throws(() => r.prepare(t, r.request([{ ...surfaceRequest(), targets: [{ path: PANEL, change: 'D' }] }])), /A\/M only/);
  assert.throws(() => r.prepare(t, r.request([surfaceRequest()], [{ input_id: 'IN-20260923-figma-009', source_refs: [] }])), /origin IN-20260923-figma-009/);
  const link = path.join(r.outside, 'link.json'); fs.symlinkSync(r.request(), link);
  assert.throws(() => r.prepare(t, link), /regular file required/);
  assert.throws(() => r.prepare(t, r.request([{ ...surfaceRequest(), unit: 'unknown-unit' }])), /unit/);
});

test('D preflight: a request inside the project is identified by its path and exact bytes', (t) => {
  const r = repository(t), file = r.request([surfaceRequest()], [], r.root);
  const env = publicScopedEnvelope(r.prepare(t, file));
  assert.equal(env.snapshot.work_request.path, 'request.json');
  assert.equal(env.snapshot.work_request.hash, `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`);
});

test('D preflight: the materialized baseline is removed on cleanup', (t) => {
  const r = repository(t), preflight = prepareScopedWork(r.flags(r.request()));
  const baseline = preflight._context.baselineRoot;
  assert.ok(fs.existsSync(baseline)); cleanupScopedWork(preflight); assert.equal(fs.existsSync(baseline), false);
});

const NEW = `${SHARED}/New.tsx`;
const codes = (result) => result.violations.map((entry) => entry.code);
const withNew = () => [{ ...surfaceRequest(), targets: [{ path: NEW, change: 'A' }, { path: PANEL, change: 'M' }] }];

test('D backstop: only allowed requested regular-file A/M targets may change', (t) => {
  const r = repository(t), preflight = r.prepare(t, r.request(withNew()));
  assert.equal(preflight.ready, true, JSON.stringify(preflight.denials));
  const idle = evaluateScopedGit(preflight);
  assert.deepEqual(idle.implementation_records, []);
  assert.deepEqual(codes(idle).sort(), ['SW-GIT-MISSING-REQUESTED', 'SW-GIT-MISSING-REQUESTED']);
  r.put(PANEL, 'export default function Panel() { return null; }\n'); r.put(NEW, 'export const New = 1;\n');
  const done = evaluateScopedGit(preflight);
  assert.equal(done.ok, true, JSON.stringify(done.violations));
  assert.deepEqual(done.implementation_records.map((record) => `${record.status}:${record.projectPath}`).sort(), [`A:${NEW}`, `M:${PANEL}`]);
  assert.equal(done.snapshot.diff_kind, 'HEAD..worktree');
});

test('D backstop: an implementation diff cannot self-grant through authority, documents or requests', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const changed = 1;\n'); r.edit('rules-1.md', ({ fm }) => { fm.status = 'draft'; });
  const authority = evaluateScopedGit(preflight);
  assert.equal(authority.ok, false);
  assert.ok(authority.violations.some((entry) => entry.code === 'SW-GIT-AUTHORITY-CHANGED' && entry.path === `${DOCS}/domains/result/rules/rules-1.md`));
  const s = repository(t), second = s.prepare(t);
  s.put(PANEL, 'export const changed = 1;\n');
  s.put(`${DOCS}/domains/result/rules/late.md`, md({ artifact_id: 'LATE', artifact_type: 'domain-rules', domain: 'result', status: 'draft' }, '## Rules\nLate.'));
  const inventory = evaluateScopedGit(second);
  assert.ok(inventory.violations.some((entry) => entry.code === 'SW-GIT-AUTHORITY-CHANGED' && entry.source === 'artifact-index'), JSON.stringify(inventory.violations));
  const third = s.prepare(t, s.request()); fs.appendFileSync(path.join(s.outside, 'request.json'), '\n');
  assert.throws(() => evaluateScopedGit(third), /work request changed after preflight/);
});

test('D backstop: unrequested paths and delete/mode/type changes are violations', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const changed = 1;\n'); r.put('src/features/result/components/other/Other.tsx', 'export const other = 1;\n');
  assert.deepEqual(codes(evaluateScopedGit(preflight)), ['SW-GIT-UNREQUESTED']);
  const d = repository(t), deleted = d.prepare(t); fs.rmSync(path.join(d.root, PANEL));
  assert.deepEqual(codes(evaluateScopedGit(deleted)).sort(), ['SW-GIT-MISSING-REQUESTED', 'SW-GIT-UNSUPPORTED-CHANGE']);
  const m = repository(t), mode = m.prepare(t); m.put(PANEL, 'export const changed = 1;\n'); fs.chmodSync(path.join(m.root, PANEL), 0o755);
  assert.deepEqual(codes(evaluateScopedGit(mode)), ['SW-GIT-MODE']);
  const y = repository(t), type = y.prepare(t); fs.rmSync(path.join(y.root, PANEL)); fs.symlinkSync('Other.tsx', path.join(y.root, PANEL));
  const typed = codes(evaluateScopedGit(type));
  assert.ok(typed.includes('SW-GIT-UNSUPPORTED-CHANGE') || typed.includes('SW-GIT-TYPE'), JSON.stringify(typed));
});

test('D backstop: a target denied at the baseline stays denied after implementation', (t) => {
  const r = repository(t); r.edit('rules-2.md', ({ fm }) => { fm.status = 'draft'; }); r.commit('draft host contract');
  const preflight = r.prepare(t); assert.equal(preflight.ready, false);
  r.put(PANEL, 'export const changed = 1;\n');
  const result = evaluateScopedGit(preflight);
  assert.equal(result.ok, false); assert.deepEqual(codes(result), ['SW-GIT-DENIED-TARGET']);
});

test('D backstop: --staged evaluates the index, not unstaged worktree bytes', (t) => {
  const r = repository(t), preflight = r.prepare(t);
  r.put(PANEL, 'export const staged = 1;\n'); git(r.root, 'add', PANEL);
  r.put('src/features/result/components/other/Unstaged.tsx', 'export const unstaged = 1;\n');
  const staged = evaluateScopedGit(preflight, { staged: true });
  assert.equal(staged.ok, true, JSON.stringify(staged.violations)); assert.equal(staged.snapshot.diff_kind, 'HEAD..index');
  assert.deepEqual(codes(evaluateScopedGit(preflight)), ['SW-GIT-UNREQUESTED']);
});

test('D backstop: API evidence directory membership is compared against the baseline listing', (t) => {
  const r = repository(t); r.put('contracts/api/one.yaml', 'openapi: 3.0.0\n'); r.commit('api evidence');
  const preflight = r.prepare(t);
  // The profile records listings for directory evidence sources; inject one here to
  // exercise the backstop comparison without an API-candidate fixture.
  preflight.snapshot.scoped_directory_read_set = [{ file: 'contracts/api', entries: [['one.yaml', 'file']] }];
  r.put(PANEL, 'export const changed = 1;\n');
  assert.equal(evaluateScopedGit(preflight).ok, true);
  r.put('contracts/api/two.yaml', 'openapi: 3.0.0\n');
  assert.ok(codes(evaluateScopedGit(preflight)).includes('SW-GIT-EVIDENCE-DIRECTORY-CHANGED'));
});
